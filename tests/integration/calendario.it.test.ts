import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { clinicaBasica, resetClinica } from '../support/cenarios';
import { startPostgres } from '../support/postgres';

const T0 = '2026-11-10T15:15:00Z'; // 12:15 em Brasília, terça-feira

describe('calendário e detalhe do dia (fase 6)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;

  async function horario(inicio: string, idMedico: number, idSala: number): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO horario (id_medico, id_sala, inicio, fim)
       VALUES ($1, $2, $3, $3::timestamptz + interval '30 minutes') RETURNING id_horario AS id`,
      [idMedico, idSala, inicio],
    );
    return rows[0]!.id;
  }

  async function reserva(idHorario: number, idPaciente: number, cancelada: string | null = null) {
    const { rows: c } = await pool.query<{ id: number }>(
      `INSERT INTO conversa (id_passo_atual, contato, inicio, ultima_interacao)
       SELECT id_passo, 'c_' || $1::text, now(), now() FROM passo_roteiro WHERE codigo_passo = 'menu'
       RETURNING id_conversa AS id`,
      [idHorario],
    );
    await pool.query(
      `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em, cancelada_em)
       VALUES ($1, $2, $3, now(), $4)`,
      [idHorario, idPaciente, c[0]!.id, cancelada],
    );
  }

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
    await resetClinica(pool);
    await clinicaBasica(pool);
    app = buildApp({ pool, clock: fixedClock(T0), corsOrigins: [] });
  }, 180_000);

  beforeEach(async () => {
    await pool.query('TRUNCATE conversa RESTART IDENTITY CASCADE');
    await pool.query('DELETE FROM horario');
    await pool.query('DELETE FROM medico');
    await pool.query('DELETE FROM sala');
    await pool.query('DELETE FROM paciente');
    await pool.query(`INSERT INTO paciente (nome, data_nascimento) VALUES ('Ana', '1998-04-15')`);
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  /** Sala 1 com três horários em 10/11 e um em 09/11; Sala 2 sem horários. */
  async function cenario(): Promise<void> {
    const { rows: m } = await pool.query<{ id: number }>(
      `INSERT INTO medico (id_especialidade, nome_medico)
       SELECT id_especialidade, 'Dra. Helena' FROM especialidade WHERE nome_especialidade = 'Dermatologia'
       RETURNING id_medico AS id`,
    );
    const { rows: s } = await pool.query<{ id: number }>(
      `INSERT INTO sala (id_clinica, nome) SELECT id_clinica, 'Sala 1' FROM clinica
       RETURNING id_sala AS id`,
    );
    await pool.query(
      `INSERT INTO sala (id_clinica, nome) SELECT id_clinica, 'Sala 2' FROM clinica`,
    );
    const { rows: p } = await pool.query<{ id: number }>(
      'SELECT id_paciente AS id FROM paciente LIMIT 1',
    );
    const idPaciente = p[0]!.id;

    const h09 = await horario('2026-11-10T09:00:00-03:00', m[0]!.id, s[0]!.id);
    const h10 = await horario('2026-11-10T10:00:00-03:00', m[0]!.id, s[0]!.id);
    const h13 = await horario('2026-11-10T13:00:00-03:00', m[0]!.id, s[0]!.id);
    const h09anterior = await horario('2026-11-09T08:00:00-03:00', m[0]!.id, s[0]!.id);

    await reserva(h09, idPaciente); // já terminou: completa
    await reserva(h10, idPaciente, '2026-11-10T11:00:00-03:00'); // cancelada
    await reserva(h13, idPaciente); // ainda não terminou: pendente
    await reserva(h09anterior, idPaciente); // dia anterior, completa
  }

  it('calendário conta as consultas por data, incluindo canceladas, e zera datas sem consulta', async () => {
    await cenario();
    const res = await request(app)
      .get('/api/calendar')
      .query({ startDate: '2026-09-27', endDateExclusive: '2026-11-11' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      meta: { timezone: 'America/Sao_Paulo', evaluatedAt: '2026-11-10T12:15:00-03:00' },
      data: { today: '2026-11-10', countsByDate: { '2026-11-09': 1, '2026-11-10': 3 } },
    });
  });

  it('o detalhe do dia soma os status e confere com o calendário (RF-13)', async () => {
    await cenario();
    const res = await request(app).get('/api/calendar/days/2026-11-10');

    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe('2026-11-10');
    expect(res.body.data.summary).toMatchObject({
      total: 3,
      complete: 1,
      pending: 1,
      cancelled: 1,
    });
    expect(res.body.data.summary.completionPercentage).toBeCloseTo(100 / 3, 10);
    expect(res.body.data.appointmentsByHour.hours).toHaveLength(24);
    expect(res.body.data.appointmentsByHour.counts[9]).toBe(1);
    expect(res.body.data.appointmentsByHour.counts[10]).toBe(1);
    expect(res.body.data.appointmentsByHour.counts[13]).toBe(1);
    expect(res.body.data.appointmentsByDayPeriod).toEqual({ morning: 2, afternoon: 1 });
  });

  it('a sala mostra contagens, ocupação sem contar canceladas e pico com desempate pela hora mais cedo', async () => {
    await cenario();
    const res = await request(app).get('/api/calendar/days/2026-11-10');
    const sala1 = res.body.data.rooms.find((r: { name: string }) => r.name === 'Sala 1');

    expect(sala1).toEqual({
      id: expect.stringMatching(/^room_\d+$/),
      name: 'Sala 1',
      appointmentCount: 3,
      cancelledCount: 1,
      totalSlots: 3,
      occupiedSlots: 2,
      occupancyPercentage: expect.closeTo(200 / 3, 10),
      peakHour: 9,
    });
  });

  it('sala cadastrada sem horários aparece com zero consultas e ocupação nula', async () => {
    await cenario();
    const res = await request(app).get('/api/calendar/days/2026-11-10');
    const sala2 = res.body.data.rooms.find((r: { name: string }) => r.name === 'Sala 2');

    expect(sala2).toMatchObject({
      appointmentCount: 0,
      cancelledCount: 0,
      totalSlots: 0,
      occupiedSlots: 0,
      occupancyPercentage: null,
      peakHour: null,
    });
  });

  it('um dia sem consultas tem resumo zerado e percentual de conclusão nulo', async () => {
    await cenario();
    const res = await request(app).get('/api/calendar/days/2026-11-12');
    expect(res.body.data.summary).toMatchObject({ total: 0, completionPercentage: null });
    expect(res.body.data.appointmentsByHour.counts.every((c: number) => c === 0)).toBe(true);
  });

  it('recusa parâmetros ausentes, datas inexistentes e intervalo invertido', async () => {
    const semInicio = await request(app)
      .get('/api/calendar')
      .query({ endDateExclusive: '2026-11-11' });
    const inexistente = await request(app)
      .get('/api/calendar')
      .query({ startDate: '2026-02-30', endDateExclusive: '2026-11-11' });
    const invertido = await request(app)
      .get('/api/calendar')
      .query({ startDate: '2026-11-11', endDateExclusive: '2026-11-10' });
    const diaInvalido = await request(app).get('/api/calendar/days/2026-13-01');

    expect(semInicio.body.error).toMatchObject({ code: 'MISSING_PARAMETER' });
    expect(inexistente.body.error.code).toBe('INVALID_DATE');
    expect(invertido.body.error.code).toBe('INVALID_DATE_RANGE');
    expect(diaInvalido.body.error.code).toBe('INVALID_DATE');
  });
});
