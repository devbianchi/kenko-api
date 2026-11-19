import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { clinicaBasica, resetClinica } from '../support/cenarios';
import { startPostgres } from '../support/postgres';

const NOW = '2026-11-10T15:15:00Z'; // 12:15 em São Paulo

describe('dashboard mensal (fase 7)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let doctorId: number;
  let room1Id: number;
  let room2Id: number;
  let specialtyId: number;
  let patientId: number;
  let conversationNumber = 0;

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
    await resetClinica(pool);
    await clinicaBasica(pool);
    app = buildApp({ pool, clock: fixedClock(NOW), corsOrigins: [] });
  }, 180_000);

  beforeEach(async () => {
    conversationNumber = 0;
    await pool.query('TRUNCATE conversa RESTART IDENTITY CASCADE');
    await pool.query('DELETE FROM horario');
    await pool.query('DELETE FROM medico');
    await pool.query('DELETE FROM sala');
    await pool.query('DELETE FROM paciente');

    const specialty = await pool.query<{ id: number }>(
      `SELECT id_especialidade AS id FROM especialidade WHERE nome_especialidade = 'Dermatologia'`,
    );
    specialtyId = specialty.rows[0]!.id;
    const doctor = await pool.query<{ id: number }>(
      `INSERT INTO medico (id_especialidade, nome_medico) VALUES ($1, 'Dra. Helena') RETURNING id_medico AS id`,
      [specialtyId],
    );
    doctorId = doctor.rows[0]!.id;
    const room1 = await pool.query<{ id: number }>(
      `INSERT INTO sala (id_clinica, nome) SELECT id_clinica, 'Sala 1' FROM clinica RETURNING id_sala AS id`,
    );
    const room2 = await pool.query<{ id: number }>(
      `INSERT INTO sala (id_clinica, nome) SELECT id_clinica, 'Sala 2' FROM clinica RETURNING id_sala AS id`,
    );
    room1Id = room1.rows[0]!.id;
    room2Id = room2.rows[0]!.id;
    const patient = await pool.query<{ id: number }>(
      `INSERT INTO paciente (nome, data_nascimento) VALUES ('Ana Silva', '1998-04-15') RETURNING id_paciente AS id`,
    );
    patientId = patient.rows[0]!.id;
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  async function slot(startsAt: string, roomId: number): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO horario (id_medico, id_sala, inicio, fim)
       VALUES ($1, $2, $3, $3::timestamptz + interval '30 minutes') RETURNING id_horario AS id`,
      [doctorId, roomId, startsAt],
    );
    return rows[0]!.id;
  }

  async function conversation(startedAt: string): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO conversa (id_passo_atual, contato, inicio, ultima_interacao)
       SELECT id_passo, $1, $2, $2 FROM passo_roteiro WHERE codigo_passo = 'menu'
       RETURNING id_conversa AS id`,
      [`dashboard_${++conversationNumber}`, startedAt],
    );
    return rows[0]!.id;
  }

  async function reserve(startsAt: string, roomId: number, cancel = false): Promise<void> {
    const slotId = await slot(startsAt, roomId);
    const conversationId = await conversation('2026-11-01T12:00:00-03:00');
    await pool.query(
      `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em, cancelada_em)
       VALUES ($1, $2, $3, $4, $5)`,
      [slotId, patientId, conversationId, NOW, cancel ? NOW : null],
    );
  }

  async function confirmation(startedAt: string, confirmedAt: string): Promise<number> {
    const conversationId = await conversation(startedAt);
    await pool.query(
      `INSERT INTO evento_conversa (id_conversa, tipo, instante, id_especialidade)
       VALUES ($1, 'APPOINTMENT_CONFIRMED', $2, $3)`,
      [conversationId, confirmedAt, specialtyId],
    );
    return conversationId;
  }

  it('retorna os totais, rankings, mediana e próximas consultas conforme os filtros da Home', async () => {
    await reserve('2026-11-10T09:00:00-03:00', room1Id);
    await reserve('2026-11-10T10:00:00-03:00', room1Id, true);
    await reserve('2026-11-10T13:00:00-03:00', room2Id);
    await reserve('2026-11-11T09:00:00-03:00', room1Id);
    await reserve('2026-10-28T09:00:00-03:00', room1Id);

    await confirmation('2026-11-02T08:00:00-03:00', '2026-11-02T08:02:00-03:00');
    const secondConversationId = await confirmation(
      '2026-11-03T08:00:00-03:00',
      '2026-11-03T08:04:00-03:00',
    );
    await pool.query(
      `INSERT INTO evento_conversa (id_conversa, tipo, instante, id_especialidade)
       VALUES ($1, 'APPOINTMENT_CONFIRMED', '2026-11-03T08:10:00-03:00', $2)`,
      [secondConversationId, specialtyId],
    ); // confirmação posterior não cria outra amostra
    await confirmation('2026-10-04T08:00:00-03:00', '2026-10-04T08:03:00-03:00');

    const response = await request(app).get('/api/dashboard?month=2026-11');
    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      timezone: 'America/Sao_Paulo',
      evaluatedAt: '2026-11-10T12:15:00-03:00',
    });
    expect(response.body.data).toMatchObject({
      clinic: { id: expect.stringMatching(/^clinic_\d+$/), name: 'Clínica Demonstração' },
      appointments: { total: 4, complete: 1, pending: 2, cancelled: 1 },
      bestDay: { date: '2026-11-10', appointmentCount: 3 },
      peakHour: {
        hour: 9,
        appointmentCount: 2,
        otherBusinessHoursAverage: 0.2,
        aboveAverage: 1.8,
      },
      bestRoom: { id: `room_${room1Id}`, name: 'Sala 1', appointmentCount: 3 },
      attendanceDuration: {
        statistic: 'median',
        seconds: 180,
        previousSeconds: 180,
        differenceSeconds: 0,
      },
    });
    expect(response.body.data.upcomingAppointments).toHaveLength(2);
    expect(response.body.data.upcomingAppointments[0]).toMatchObject({
      status: 'pending',
      startsAt: '2026-11-10T13:00:00-03:00',
      patient: { id: `pt_${patientId}`, name: 'Ana Silva' },
      specialty: { id: `sp_${specialtyId}`, name: 'Dermatologia' },
      doctor: { id: `dr_${doctorId}`, name: 'Dra. Helena' },
      room: { id: `room_${room2Id}`, name: 'Sala 2' },
    });
  });

  it('não filtra as próximas consultas pelo mês e retorna nulos sem base histórica', async () => {
    await reserve('2026-12-01T09:00:00-03:00', room1Id);
    const response = await request(app).get('/api/dashboard?month=2026-11');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      appointments: { total: 0, complete: 0, pending: 0, cancelled: 0 },
      bestDay: null,
      peakHour: null,
      bestRoom: null,
      attendanceDuration: {
        statistic: 'median',
        seconds: null,
        previousSeconds: null,
        differenceSeconds: null,
      },
    });
    expect(response.body.data.upcomingAppointments).toHaveLength(1);
  });

  it('desempata rankings por dia e sala e limita as próximas consultas às cinco mais cedo', async () => {
    await reserve('2026-11-11T09:00:00-03:00', room1Id);
    await reserve('2026-11-11T10:00:00-03:00', room2Id);
    await reserve('2026-11-10T09:00:00-03:00', room2Id);
    await reserve('2026-11-10T10:00:00-03:00', room1Id);
    for (const day of [12, 13, 14, 15, 16, 17]) {
      await reserve(`2026-12-${String(day).padStart(2, '0')}T09:00:00-03:00`, room1Id);
    }

    const response = await request(app).get('/api/dashboard?month=2026-11');
    expect(response.status).toBe(200);
    expect(response.body.data.bestDay).toEqual({ date: '2026-11-10', appointmentCount: 2 });
    expect(response.body.data.bestRoom.id).toBe(`room_${room1Id}`);
    expect(response.body.data.peakHour.hour).toBe(9);
    expect(response.body.data.upcomingAppointments).toHaveLength(5);
    expect(response.body.data.upcomingAppointments[0].startsAt).toBe('2026-11-11T09:00:00-03:00');
    expect(response.body.data.upcomingAppointments[4].startsAt).toBe('2026-12-14T09:00:00-03:00');
  });

  it('valida o mês obrigatório e a existência do mês no formato YYYY-MM', async () => {
    const missing = await request(app).get('/api/dashboard');
    const invalid = await request(app).get('/api/dashboard?month=2026-13');
    expect(missing.body.error).toMatchObject({ code: 'MISSING_PARAMETER' });
    expect(invalid.body.error).toMatchObject({ code: 'INVALID_MONTH' });
  });
});
