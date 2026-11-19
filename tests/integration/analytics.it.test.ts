import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { clinicaBasica, resetClinica } from '../support/cenarios';
import { startPostgres } from '../support/postgres';

const NOW = '2026-11-10T15:15:00Z'; // terça, 12:15 em São Paulo

describe('analytics (fase 8a)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let doctorId: number;
  let roomId: number;
  let specialtyId: number;
  let patientId: number;
  let menuStepId: number;
  let contactNumber = 0;

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
    await resetClinica(pool);
    await clinicaBasica(pool);
    app = buildApp({ pool, clock: fixedClock(NOW), corsOrigins: [] });
  }, 180_000);

  beforeEach(async () => {
    contactNumber = 0;
    await pool.query('TRUNCATE conversa RESTART IDENTITY CASCADE');
    await pool.query('DELETE FROM horario');
    await pool.query('DELETE FROM medico');
    await pool.query('DELETE FROM sala');
    await pool.query('DELETE FROM paciente');

    const specialty = await pool.query<{ id: number }>(
      `SELECT id_especialidade AS id FROM especialidade WHERE nome_especialidade = 'Dermatologia'`,
    );
    specialtyId = specialty.rows[0]!.id;
    const menu = await pool.query<{ id: number }>(
      `SELECT id_passo AS id FROM passo_roteiro WHERE codigo_passo = 'menu'`,
    );
    menuStepId = menu.rows[0]!.id;
    doctorId = (
      await pool.query<{ id: number }>(
        `INSERT INTO medico (id_especialidade, nome_medico) VALUES ($1, 'Dra. Helena') RETURNING id_medico AS id`,
        [specialtyId],
      )
    ).rows[0]!.id;
    roomId = (
      await pool.query<{ id: number }>(
        `INSERT INTO sala (id_clinica, nome) SELECT id_clinica, 'Sala 1' FROM clinica RETURNING id_sala AS id`,
      )
    ).rows[0]!.id;
    patientId = (
      await pool.query<{ id: number }>(
        `INSERT INTO paciente (nome, data_nascimento) VALUES ('Ana Silva', '1998-04-15') RETURNING id_paciente AS id`,
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  async function conversation(startedAt: string): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO conversa (id_passo_atual, contato, inicio, ultima_interacao)
       VALUES ($1, $2, $3, $3) RETURNING id_conversa AS id`,
      [menuStepId, `analytics_${++contactNumber}`, startedAt],
    );
    return rows[0]!.id;
  }

  async function event(conversationId: number, tipo: string, instante: string): Promise<void> {
    await pool.query(
      `INSERT INTO evento_conversa (id_conversa, tipo, instante) VALUES ($1, $2, $3)`,
      [conversationId, tipo, instante],
    );
  }

  async function slot(startsAt: string): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO horario (id_medico, id_sala, inicio, fim)
       VALUES ($1, $2, $3, $3::timestamptz + interval '30 minutes') RETURNING id_horario AS id`,
      [doctorId, roomId, startsAt],
    );
    return rows[0]!.id;
  }

  async function reserve(
    conversationId: number,
    startsAt: string,
    cancelledAt?: string,
  ): Promise<void> {
    const slotId = await slot(startsAt);
    await pool.query(
      `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em, cancelada_em)
       VALUES ($1, $2, $3, $4, $5)`,
      [slotId, patientId, conversationId, NOW, cancelledAt ?? null],
    );
  }

  async function searchWithoutSlots(conversationId: number, instante: string): Promise<void> {
    const tentativa = await pool.query<{ id: number }>(
      `INSERT INTO tentativa (id_conversa, numero, id_especialidade, iniciada_em)
       VALUES ($1, COALESCE((SELECT max(numero) FROM tentativa WHERE id_conversa = $1), 0) + 1, $2, $3)
       RETURNING id_tentativa AS id`,
      [conversationId, specialtyId, instante],
    );
    await pool.query(
      `INSERT INTO busca_sem_horario (id_conversa, id_tentativa, id_especialidade, instante)
       VALUES ($1, $2, $3, $4)`,
      [conversationId, tentativa.rows[0]!.id, specialtyId, instante],
    );
  }

  /** Dados de novembro e de uma conversa de outubro, com os fatos esperados nos asserts. */
  async function novemberScenario(): Promise<void> {
    // Outubro, dentro do período anterior de novembro: confirmou em 240 s.
    const october = await conversation('2026-10-28T10:00:00-03:00');
    await event(october, 'STARTED_SCHEDULING', '2026-10-28T10:00:30-03:00');
    await event(october, 'APPOINTMENT_CONFIRMED', '2026-10-28T10:04:00-03:00');
    await searchWithoutSlots(october, '2026-10-31T12:00:00-03:00');

    // Segunda, 09h: confirmou em 180 s.
    const confirmedMonday = await conversation('2026-11-02T09:00:00-03:00');
    await event(confirmedMonday, 'STARTED_SCHEDULING', '2026-11-02T09:01:00-03:00');
    await event(confirmedMonday, 'APPOINTMENT_CONFIRMED', '2026-11-02T09:03:00-03:00');
    await reserve(confirmedMonday, '2026-11-02T09:30:00-03:00');

    // Segunda, 19h (fora do expediente): agendou e não confirmou; buscou sem horário duas vezes.
    const outsideMonday = await conversation('2026-11-02T19:00:00-03:00');
    await event(outsideMonday, 'STARTED_SCHEDULING', '2026-11-02T19:00:10-03:00');
    await searchWithoutSlots(outsideMonday, '2026-11-04T11:00:00-03:00');
    await searchWithoutSlots(outsideMonday, '2026-11-04T11:05:00-03:00');

    // Terça, 10h: duas confirmações (vale a primeira), duas reservas ativas e uma cancelada.
    const twice = await conversation('2026-11-03T10:00:00-03:00');
    await event(twice, 'STARTED_SCHEDULING', '2026-11-03T10:00:20-03:00');
    await event(twice, 'APPOINTMENT_CONFIRMED', '2026-11-03T10:02:00-03:00');
    await event(twice, 'APPOINTMENT_CONFIRMED', '2026-11-03T10:05:00-03:00');
    await reserve(twice, '2026-11-03T10:30:00-03:00');
    await reserve(twice, '2026-11-03T11:00:00-03:00');
    await reserve(twice, '2026-11-03T15:00:00-03:00', NOW);

    // Sábado, 14h (fora: sábado fecha às 13h): só informou, não agendou.
    await conversation('2026-11-07T14:00:00-03:00');

    // Domingo, 10h (fora: domingo fechado): agendou e não confirmou.
    const sunday = await conversation('2026-11-08T10:00:00-03:00');
    await event(sunday, 'STARTED_SCHEDULING', '2026-11-08T10:00:05-03:00');
  }

  it('calcula os cinco KPIs do mês com a janela anterior e é reproduzível', async () => {
    await novemberScenario();

    const first = await request(app).get('/api/analytics?period=month&reference=2026-11');
    const second = await request(app).get('/api/analytics?period=month&reference=2026-11');
    expect(first.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);

    expect(first.body.meta).toMatchObject({
      timezone: 'America/Sao_Paulo',
      evaluatedAt: '2026-11-10T12:15:00-03:00',
      period: {
        type: 'month',
        reference: '2026-11',
        start: '2026-11-01T00:00:00-03:00',
        endExclusive: '2026-12-01T00:00:00-03:00',
      },
      previousPeriod: {
        start: '2026-10-02T00:00:00-03:00',
        endExclusive: '2026-11-01T00:00:00-03:00',
      },
    });

    expect(first.body.data.kpis).toEqual({
      botCompletion: {
        percentage: 50,
        confirmedConversations: 2,
        schedulingConversations: 4,
        previousValue: 100,
        difference: -50,
        differenceUnit: 'percentage_points',
      },
      attendanceDuration: {
        statistic: 'median',
        seconds: 150,
        sampleSize: 2,
        previousValue: 240,
        difference: -90,
        differenceUnit: 'seconds',
      },
      outsideBusinessHours: {
        percentage: 60,
        outsideConversations: 3,
        startedConversations: 5,
        previousValue: 0,
        difference: 60,
        differenceUnit: 'percentage_points',
      },
      agendaOccupancy: {
        percentage: 75,
        occupiedSlots: 3,
        totalSlots: 4,
        previousValue: null,
        difference: null,
        differenceUnit: 'percentage_points',
      },
      searchesWithoutSlots: {
        count: 2,
        previousValue: 1,
        difference: 1,
        differenceUnit: 'count',
      },
    });
  });

  it('agrupa a conversa pela data de início, mesmo com confirmação no mês seguinte', async () => {
    const started = await conversation('2026-10-31T23:50:00-03:00');
    await event(started, 'STARTED_SCHEDULING', '2026-10-31T23:51:00-03:00');
    await event(started, 'APPOINTMENT_CONFIRMED', '2026-11-01T00:05:00-03:00');

    const october = await request(app).get('/api/analytics?period=month&reference=2026-10');
    expect(october.body.data.kpis.botCompletion).toMatchObject({
      percentage: 100,
      schedulingConversations: 1,
    });
    expect(october.body.data.kpis.attendanceDuration).toMatchObject({
      seconds: 900,
      sampleSize: 1,
    });
    expect(october.body.data.kpis.outsideBusinessHours).toMatchObject({ percentage: 100 });

    const november = await request(app).get('/api/analytics?period=month&reference=2026-11');
    expect(november.body.data.kpis.botCompletion).toMatchObject({
      percentage: null,
      schedulingConversations: 0,
    });
    expect(november.body.data.kpis.attendanceDuration).toMatchObject({
      seconds: null,
      sampleSize: 0,
    });
    expect(november.body.data.kpis.outsideBusinessHours).toMatchObject({ percentage: null });
  });

  it('muda o período resolvido conforme o filtro semana ou ano', async () => {
    const week = await request(app).get('/api/analytics?period=week&reference=2026-11-10');
    expect(week.body.meta.period).toMatchObject({
      start: '2026-11-04T00:00:00-03:00',
      endExclusive: '2026-11-11T00:00:00-03:00',
    });
    expect(week.body.meta.previousPeriod).toEqual({
      start: '2026-10-28T00:00:00-03:00',
      endExclusive: '2026-11-04T00:00:00-03:00',
    });

    const year = await request(app).get('/api/analytics?period=year&reference=2026');
    expect(year.body.meta.period).toMatchObject({
      start: '2026-01-01T00:00:00-03:00',
      endExclusive: '2026-12-01T00:00:00-03:00',
    });
  });

  it('mostra null e zero, sem inventar valores, quando o período não tem dados', async () => {
    const response = await request(app).get('/api/analytics?period=month&reference=2026-09');
    expect(response.status).toBe(200);
    expect(response.body.data.kpis).toMatchObject({
      botCompletion: { percentage: null, schedulingConversations: 0 },
      attendanceDuration: { seconds: null, sampleSize: 0 },
      outsideBusinessHours: { percentage: null, startedConversations: 0 },
      agendaOccupancy: { percentage: null, totalSlots: 0 },
      searchesWithoutSlots: { count: 0 },
    });
  });

  it('responde os códigos de erro do catálogo para período e referência inválidos', async () => {
    const cases: Array<[string, number, string]> = [
      ['/api/analytics?reference=2026-11', 400, 'MISSING_PARAMETER'],
      ['/api/analytics?period=day&reference=2026-11-10', 400, 'INVALID_PERIOD'],
      ['/api/analytics?period=month&reference=2026-13', 400, 'INVALID_PERIOD'],
      ['/api/analytics?period=week&reference=2026-02-30', 400, 'INVALID_PERIOD'],
      ['/api/analytics?period=week&reference=2026-11-11', 400, 'FUTURE_PERIOD'],
      ['/api/analytics?period=month&reference=2026-12', 400, 'FUTURE_PERIOD'],
      ['/api/analytics?period=year&reference=2027', 400, 'FUTURE_PERIOD'],
    ];
    for (const [url, status, code] of cases) {
      const response = await request(app).get(url);
      expect(response.status, url).toBe(status);
      expect(response.body.error.code, url).toBe(code);
    }
  });

  it('não grava nada ao ler os indicadores', async () => {
    await novemberScenario();
    const counts = async () =>
      (
        await pool.query<{ conversas: string; eventos: string; reservas: string }>(
          `SELECT (SELECT count(*) FROM conversa)::text AS conversas,
                  (SELECT count(*) FROM evento_conversa)::text AS eventos,
                  (SELECT count(*) FROM reserva)::text AS reservas`,
        )
      ).rows[0];

    const before = await counts();
    await request(app).get('/api/analytics?period=month&reference=2026-11');
    await request(app).get('/api/analytics?period=year&reference=2026');
    expect(await counts()).toEqual(before);
  });
});
