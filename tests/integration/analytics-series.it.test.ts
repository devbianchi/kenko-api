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

describe('distribuições e séries de Analytics (fase 8c)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let menuStepId: number;
  let specialties: Record<string, number>;
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
    menuStepId = (
      await pool.query<{ id: number }>(
        `SELECT id_passo AS id FROM passo_roteiro WHERE codigo_passo = 'menu'`,
      )
    ).rows[0]!.id;
    const rows = await pool.query<{ nome: string; id: number }>(
      `SELECT nome_especialidade AS nome, id_especialidade AS id FROM especialidade`,
    );
    specialties = Object.fromEntries(rows.rows.map((row) => [row.nome, row.id]));
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  async function conversation(inicio: string): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO conversa (id_passo_atual, contato, inicio, ultima_interacao)
       VALUES ($1, $2, $3, $3) RETURNING id_conversa AS id`,
      [menuStepId, `series_${++contactNumber}`, inicio],
    );
    return rows[0]!.id;
  }

  async function events(conversationId: number, tipos: Array<[string, string]>): Promise<void> {
    for (const [tipo, instante] of tipos) {
      await pool.query(
        `INSERT INTO evento_conversa (id_conversa, tipo, instante) VALUES ($1, $2, $3)`,
        [conversationId, tipo, instante],
      );
    }
  }

  async function search(
    conversationId: number,
    specialtyId: number,
    instante: string,
  ): Promise<void> {
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

  async function novemberScenario(): Promise<void> {
    // Segunda, 09h: 40 s até a confirmação. Duas buscas sem horário em dermatologia.
    const x1 = await conversation('2026-11-02T09:00:00-03:00');
    await events(x1, [
      ['STARTED_SCHEDULING', '2026-11-02T09:00:10-03:00'],
      ['APPOINTMENT_CONFIRMED', '2026-11-02T09:00:40-03:00'],
    ]);
    await search(x1, specialties['Dermatologia']!, '2026-11-04T11:00:00-03:00');
    await search(x1, specialties['Dermatologia']!, '2026-11-04T11:05:00-03:00');

    // Segunda, 09h30: 90 s. Uma busca em ortopedia.
    const x2 = await conversation('2026-11-02T09:30:00-03:00');
    await events(x2, [
      ['STARTED_SCHEDULING', '2026-11-02T09:30:10-03:00'],
      ['APPOINTMENT_CONFIRMED', '2026-11-02T09:31:30-03:00'],
    ]);
    await search(x2, specialties['Ortopedia']!, '2026-11-04T12:00:00-03:00');

    // Terça, 10h: 610 s, entra em "10+".
    const x3 = await conversation('2026-11-03T10:00:00-03:00');
    await events(x3, [
      ['STARTED_SCHEDULING', '2026-11-03T10:00:10-03:00'],
      ['APPOINTMENT_CONFIRMED', '2026-11-03T10:10:10-03:00'],
    ]);

    // Sábado, 14h: 720 s, entra em "10+". Fora do expediente, mas conta no mapa de calor.
    const x4 = await conversation('2026-11-07T14:00:00-03:00');
    await events(x4, [
      ['STARTED_SCHEDULING', '2026-11-07T14:00:10-03:00'],
      ['APPOINTMENT_CONFIRMED', '2026-11-07T14:12:00-03:00'],
    ]);

    // Segunda, 19h: só informou. Conta no mapa de calor, não na duração nem na conclusão.
    await conversation('2026-11-02T19:00:00-03:00');

    // Segunda, 10h, dia 9: escolheu agendar e não confirmou. Entra só na série de conclusão.
    const x6 = await conversation('2026-11-09T10:00:00-03:00');
    await events(x6, [['STARTED_SCHEDULING', '2026-11-09T10:00:10-03:00']]);
  }

  it('monta o histograma, a mediana e o P90 com as conversas confirmadas', async () => {
    await novemberScenario();
    const response = await request(app).get('/api/analytics?period=month&reference=2026-11');
    expect(response.status).toBe(200);

    const duration = response.body.data.durationDistribution;
    expect(duration).toMatchObject({ unit: 'seconds', sampleSize: 4, median: 350, p90: 720 });
    expect(duration.buckets[0]).toMatchObject({ label: '1', count: 1 });
    expect(duration.buckets[1]).toMatchObject({ label: '2', count: 1 });
    expect(duration.buckets[10]).toMatchObject({
      label: '10+',
      fromInclusive: 600,
      toExclusive: null,
      count: 2,
    });
    expect(
      duration.buckets.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0),
    ).toBe(4);
  });

  it('conta inícios de conversa por dia e faixa de duas horas, inclusive fora do expediente', async () => {
    await novemberScenario();
    const response = await request(app).get('/api/analytics?period=month&reference=2026-11');
    const rows: Array<{ weekday: number; counts: number[] }> =
      response.body.data.conversationHeatmap.rows;

    expect(rows.map((row) => row.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    const monday = rows.find((row) => row.weekday === 1)!.counts;
    expect(monday[4]).toBe(2); // 08h–10h: x1 e x2
    expect(monday[5]).toBe(1); // 10h–12h: x6, que escolheu agendar e não confirmou
    expect(monday[9]).toBe(1); // 18h–20h: só informou, fora do expediente
    expect(rows.find((row) => row.weekday === 2)!.counts[5]).toBe(1);
    expect(rows.find((row) => row.weekday === 6)!.counts[7]).toBe(1);
    const total = rows.reduce((sum, row) => sum + row.counts.reduce((a, b) => a + b, 0), 0);
    expect(total).toBe(6);
  });

  it('calcula a série de conclusão por bloco com média móvel e null sem base', async () => {
    await novemberScenario();
    const response = await request(app).get('/api/analytics?period=month&reference=2026-11');
    const series = response.body.data.completionSeries;

    expect(series.grouping).toBe('month_blocks');
    expect(series.movingAverageWindow).toBe(3);
    expect(series.points.map((point: { label: string }) => point.label)).toEqual([
      '01–07',
      '08–14',
      '15–21',
      '22–28',
      '29–30',
    ]);
    // Bloco 1: quatro escolhas de agendamento, quatro confirmações. Bloco 2: uma escolha, nenhuma confirmação.
    expect(series.points.map((point: { percentage: number | null }) => point.percentage)).toEqual([
      100,
      0,
      null,
      null,
      null,
    ]);
    expect(
      series.points.map((point: { movingAverage: number | null }) => point.movingAverage),
    ).toEqual([100, 50, 50, 0, null]);
  });

  it('soma as buscas sem horário por especialidade e confere com o KPI do mesmo período', async () => {
    await novemberScenario();
    const response = await request(app).get('/api/analytics?period=month&reference=2026-11');
    const bySpecialty: Array<{ specialtyId: string; name: string; count: number }> =
      response.body.data.searchesWithoutSlotsBySpecialty;

    expect(bySpecialty).toEqual([
      { specialtyId: `sp_${specialties['Dermatologia']}`, name: 'Dermatologia', count: 2 },
      { specialtyId: `sp_${specialties['Ortopedia']}`, name: 'Ortopedia', count: 1 },
    ]);
    const soma = bySpecialty.reduce((total, item) => total + item.count, 0);
    expect(soma).toBe(response.body.data.kpis.searchesWithoutSlots.count);
  });

  it('não devolve dados pessoais nem transcrições na resposta (VAL-42)', async () => {
    await novemberScenario();
    const response = await request(app).get('/api/analytics?period=month&reference=2026-11');
    const texto = JSON.stringify(response.body);
    expect(texto).not.toContain('contato');
    expect(texto).not.toContain('series_');
    expect(texto).not.toContain('Silva');
  });
});
