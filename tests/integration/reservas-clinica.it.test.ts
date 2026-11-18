import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { clinicaBasica, resetClinica } from '../support/cenarios';
import { startPostgres } from '../support/postgres';

const T0 = '2026-11-10T15:00:00Z'; // terça-feira, 12:00 em Brasília
const UMA_HORA = 60 * 60 * 1000;

describe('reservas da conversa e informações da clínica (fase 5e)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let contador = 0;

  function appEm(instante: string) {
    return buildApp({ pool, clock: fixedClock(instante), corsOrigins: [] });
  }

  async function contar(sql: string): Promise<number> {
    const { rows } = await pool.query<{ n: number }>(`SELECT (${sql})::int AS n`);
    return rows[0]!.n;
  }

  async function especialidadeId(nome: string): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      'SELECT id_especialidade AS id FROM especialidade WHERE nome_especialidade = $1',
      [nome],
    );
    return rows[0]!.id;
  }

  async function agenda(inicios: string[]): Promise<void> {
    const { rows: m } = await pool.query<{ id: number }>(
      `INSERT INTO medico (id_especialidade, nome_medico) VALUES ($1, 'Dra. Helena') RETURNING id_medico AS id`,
      [await especialidadeId('Dermatologia')],
    );
    const { rows: s } = await pool.query<{ id: number }>(
      `INSERT INTO sala (id_clinica, nome) SELECT id_clinica, 'Sala 1' FROM clinica LIMIT 1 RETURNING id_sala AS id`,
    );
    for (const inicio of inicios) {
      await pool.query(
        `INSERT INTO horario (id_medico, id_sala, inicio, fim)
         VALUES ($1, $2, $3, $3::timestamptz + interval '30 minutes')`,
        [m[0]!.id, s[0]!.id, inicio],
      );
    }
  }

  /** Conversa com contato próprio, agendada e confirmada. Devolve o id da conversa e da reserva. */
  async function agendar(
    horarioInicio: string,
  ): Promise<{ id: string; reservaId: string; revisao: number }> {
    contador += 1;
    const conv = await request(app)
      .post('/api/conversations')
      .send({ contactId: `contato_${contador}` });
    const id = conv.body.conversation.id as string;
    const passos: [number, object][] = [
      [0, { type: 'select_option', optionId: 'opt_schedule' }],
      [1, { type: 'select_option', optionId: `sp_${await especialidadeId('Dermatologia')}` }],
      [2, { type: 'select_option', optionId: 'opt_first_visit' }],
    ];
    let revisao = 0;
    for (const [i, input] of passos) {
      const r = await request(app)
        .post(`/api/conversations/${id}/interactions`)
        .send({ actionId: `${id}_p${i}`, expectedRevision: revisao, input });
      revisao = r.body.conversation.revision;
    }
    const slot = (await request(app).get(`/api/conversations/${id}`)).body.view.slots.find(
      (s: { startsAt: string }) => s.startsAt === horarioInicio,
    ).id as string;
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: `${id}_escolha`,
        expectedRevision: revisao,
        input: { type: 'select_slot', slotId: slot },
      });
    const confirmada = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: `${id}_nome`,
        expectedRevision: revisao + 1,
        input: { type: 'submit_patient', patient: { name: 'Ana Silva', birthDate: '1998-04-15' } },
      });
    return {
      id,
      reservaId: confirmada.body.result.appointment.id as string,
      revisao: confirmada.body.conversation.revision,
    };
  }

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
    await resetClinica(pool);
    await clinicaBasica(pool);
    app = appEm(T0);
  }, 180_000);

  beforeEach(async () => {
    await pool.query('TRUNCATE conversa RESTART IDENTITY CASCADE');
    await pool.query('DELETE FROM horario');
    await pool.query('DELETE FROM medico');
    await pool.query('DELETE FROM sala');
    await pool.query('DELETE FROM paciente');
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('mostra as informações da clínica e volta ao menu, sem encerrar (contrato, 6.4)', async () => {
    const conv = await request(app).post('/api/conversations').send({ contactId: 'info' });
    const id = conv.body.conversation.id as string;

    const info = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'i1',
        expectedRevision: 0,
        input: { type: 'select_option', optionId: 'opt_clinic_info' },
      });
    expect(info.status).toBe(200);
    expect(info.body.conversation).toMatchObject({
      step: 'clinic_information',
      effectiveStatus: 'active',
    });
    expect(info.body.view).toMatchObject({
      type: 'clinic_information',
      clinic: {
        id: 'clinic_1',
        name: 'Clínica Demonstração',
        address: 'Rua de Exemplo, 100',
        phone: '1100000000',
        openingHours: [
          { weekdays: [1, 2, 3, 4, 5], opensAt: '07:00', closesAt: '18:00' },
          { weekdays: [6], opensAt: '09:00', closesAt: '13:00' },
          { weekdays: [0], closed: true },
        ],
        specialties: [
          { id: 'sp_1', name: 'Clínico geral' },
          { id: 'sp_2', name: 'Dermatologia' },
          { id: 'sp_3', name: 'Ortopedia' },
          { id: 'sp_4', name: 'Cardiologia' },
        ],
      },
      options: [{ id: 'opt_menu', label: 'Voltar ao menu' }],
    });

    const volta = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'i2',
        expectedRevision: 1,
        input: { type: 'select_option', optionId: 'opt_menu' },
      });
    expect(volta.body.conversation).toMatchObject({ step: 'menu', effectiveStatus: 'active' });
  });

  it('lista as reservas da conversa com status e permissão de cancelamento', async () => {
    await agenda(['2026-11-11T09:00:00-03:00']);
    const { id, reservaId, revisao } = await agendar('2026-11-11T09:00:00-03:00');

    const menu = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'l1',
        expectedRevision: revisao,
        input: { type: 'select_option', optionId: 'opt_appointments' },
      });
    expect(menu.body.conversation.step).toBe('appointments');
    expect(menu.body.view).toMatchObject({
      type: 'appointments',
      appointments: [
        {
          id: reservaId,
          status: 'pending',
          canCancel: true,
          startsAt: '2026-11-11T09:00:00-03:00',
          patient: { name: 'Ana Silva' },
          specialty: { name: 'Dermatologia' },
          doctor: { name: 'Dra. Helena' },
          room: { name: 'Sala 1' },
        },
      ],
      options: [{ id: 'opt_menu', label: 'Voltar ao menu' }],
    });

    const lista = await request(app).get(`/api/conversations/${id}/appointments`);
    expect(lista.status).toBe(200);
    expect(lista.body.data).toEqual([menu.body.view.appointments[0]]);
    expect(await contar(`SELECT revisao FROM conversa`)).toBe(menu.body.conversation.revision);
  });

  it('cancela a reserva pendente, libera o horário para nova oferta e preserva o registro (VAL-09)', async () => {
    await agenda(['2026-11-11T09:00:00-03:00']);
    const { id, reservaId, revisao } = await agendar('2026-11-11T09:00:00-03:00');
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'c0',
        expectedRevision: revisao,
        input: { type: 'select_option', optionId: 'opt_appointments' },
      });

    const cancelada = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'c1',
        expectedRevision: revisao + 1,
        input: { type: 'cancel_appointment', appointmentId: reservaId },
      });

    expect(cancelada.status).toBe(200);
    expect(cancelada.body.result).toEqual({
      type: 'appointment_cancelled',
      appointmentId: reservaId,
    });
    expect(cancelada.body.conversation.step).toBe('menu');
    expect(await contar(`SELECT count(*) FROM reserva WHERE cancelada_em IS NOT NULL`)).toBe(1);
    expect(await contar(`SELECT count(*) FROM paciente`)).toBe(1);

    // O horário cancelado volta a ser oferecido a outra conversa, porque ainda é futuro.
    const { rows: h } = await pool.query<{ id: number }>(
      `SELECT r.id_horario AS id FROM reserva r WHERE r.id_reserva = $1`,
      [Number(reservaId.replace('ap_', ''))],
    );
    const outra = await request(app).post('/api/conversations').send({ contactId: 'depois' });
    const outraId = outra.body.conversation.id as string;
    await request(app)
      .post(`/api/conversations/${outraId}/interactions`)
      .send({
        actionId: 'o1',
        expectedRevision: 0,
        input: { type: 'select_option', optionId: 'opt_schedule' },
      });
    await request(app)
      .post(`/api/conversations/${outraId}/interactions`)
      .send({
        actionId: 'o2',
        expectedRevision: 1,
        input: { type: 'select_option', optionId: `sp_${await especialidadeId('Dermatologia')}` },
      });
    const visita = await request(app)
      .post(`/api/conversations/${outraId}/interactions`)
      .send({
        actionId: 'o3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_first_visit' },
      });
    expect(visita.body.view.slots.map((s: { id: string }) => s.id)).toContain(`slot_${h[0]!.id}`);
  });

  it('reserva de outra conversa não é encontrada nem cancelada (VAL-08)', async () => {
    await agenda(['2026-11-11T09:00:00-03:00', '2026-11-12T14:00:00-03:00']);
    const dona = await agendar('2026-11-11T09:00:00-03:00');
    const outra = await agendar('2026-11-12T14:00:00-03:00');
    await request(app)
      .post(`/api/conversations/${outra.id}/interactions`)
      .send({
        actionId: 'x0',
        expectedRevision: outra.revisao,
        input: { type: 'select_option', optionId: 'opt_appointments' },
      });

    const res = await request(app)
      .post(`/api/conversations/${outra.id}/interactions`)
      .send({
        actionId: 'x1',
        expectedRevision: outra.revisao + 1,
        input: { type: 'cancel_appointment', appointmentId: dona.reservaId },
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('APPOINTMENT_NOT_FOUND');
    expect(await contar(`SELECT count(*) FROM reserva WHERE cancelada_em IS NULL`)).toBe(2);
  });

  it('consulta completa não pode ser cancelada, e a lista mostra canCancel falso (VAL-30)', async () => {
    await agenda(['2026-11-09T09:00:00-03:00']);
    const { rows: h } = await pool.query<{ id: number }>(
      'SELECT id_horario AS id FROM horario LIMIT 1',
    );
    const conv = await request(app).post('/api/conversations').send({ contactId: 'completa' });
    const id = conv.body.conversation.id as string;
    const { rows: p } = await pool.query<{ id: number }>(
      `INSERT INTO paciente (nome, data_nascimento) VALUES ('Ana', '1998-04-15') RETURNING id_paciente AS id`,
    );
    const { rows: r } = await pool.query<{ id: number }>(
      `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em)
       SELECT $1, $2, id_conversa, now() FROM conversa WHERE contato = 'completa' RETURNING id_reserva AS id`,
      [h[0]!.id, p[0]!.id],
    );
    const reservaId = `ap_${r[0]!.id}`;

    const appointments = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'z0',
        expectedRevision: 0,
        input: { type: 'select_option', optionId: 'opt_appointments' },
      });
    expect(appointments.body.view.appointments[0]).toMatchObject({
      status: 'complete',
      canCancel: false,
    });

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'z1',
        expectedRevision: 1,
        input: { type: 'cancel_appointment', appointmentId: reservaId },
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPOINTMENT_NOT_CANCELLABLE');
    expect(await contar(`SELECT count(*) FROM reserva WHERE cancelada_em IS NULL`)).toBe(1);
  });

  it('Sair depois de confirmar encerra a conversa e preserva a reserva (VAL-10)', async () => {
    await agenda(['2026-11-11T09:00:00-03:00']);
    const { id, revisao } = await agendar('2026-11-11T09:00:00-03:00');

    const saiu = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({ actionId: 's1', expectedRevision: revisao, input: { type: 'exit' } });

    expect(saiu.body.conversation).toMatchObject({ effectiveStatus: 'closed', step: 'closed' });
    expect(await contar(`SELECT count(*) FROM reserva WHERE cancelada_em IS NULL`)).toBe(1);
    expect(await contar(`SELECT count(*) FROM paciente`)).toBe(1);
  });

  it('depois de abandonar, um novo contato começa outra conversa e a antiga fica inalterada (VAL-13)', async () => {
    const antiga = await request(app).post('/api/conversations').send({ contactId: 'antiga' });
    const id = antiga.body.conversation.id as string;
    const depois = appEm(new Date(Date.parse(T0) + UMA_HORA + 1000).toISOString());

    const nova = await request(depois).post('/api/conversations').send({ contactId: 'nova' });
    expect(nova.body.conversation.id).not.toBe(id);
    expect(nova.body.conversation.effectiveStatus).toBe('active');

    const velha = await request(depois).get(`/api/conversations/${id}`);
    expect(velha.body.conversation).toMatchObject({ effectiveStatus: 'abandoned', revision: 0 });
    const reabre = await request(depois)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'v1',
        expectedRevision: 0,
        input: { type: 'select_option', optionId: 'opt_schedule' },
      });
    expect(reabre.body.error.code).toBe('CONVERSATION_ABANDONED');
  });
});
