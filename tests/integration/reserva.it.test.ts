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

describe('reserva: escolha de horário, identificação e confirmação (fase 5d)', () => {
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

  /** Cria um médico com sala própria e os horários pedidos. Devolve os ids dos horários. */
  async function agenda(especialidade: string, inicios: string[]): Promise<number[]> {
    const { rows: m } = await pool.query<{ id: number }>(
      `INSERT INTO medico (id_especialidade, nome_medico) VALUES ($1, 'Dra. Helena') RETURNING id_medico AS id`,
      [await especialidadeId(especialidade)],
    );
    const { rows: s } = await pool.query<{ id: number }>(
      `INSERT INTO sala (id_clinica, nome) SELECT id_clinica, 'Sala 1' FROM clinica LIMIT 1 RETURNING id_sala AS id`,
    );
    const ids: number[] = [];
    for (const inicio of inicios) {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO horario (id_medico, id_sala, inicio, fim)
         VALUES ($1, $2, $3, $3::timestamptz + interval '30 minutes') RETURNING id_horario AS id`,
        [m[0]!.id, s[0]!.id, inicio],
      );
      ids.push(rows[0]!.id);
    }
    return ids;
  }

  /** Conversa com contato próprio, levada até a tela de horários de uma especialidade. */
  async function ateHorarios(especialidade: string): Promise<{ id: string; revisao: number }> {
    contador += 1;
    const conv = await request(app)
      .post('/api/conversations')
      .send({ contactId: `contato_${contador}` });
    const id = conv.body.conversation.id as string;
    const passos: [string, number, object][] = [
      ['a1', 0, { type: 'select_option', optionId: 'opt_schedule' }],
      ['a2', 1, { type: 'select_option', optionId: `sp_${await especialidadeId(especialidade)}` }],
      ['a3', 2, { type: 'select_option', optionId: 'opt_first_visit' }],
    ];
    for (const [actionId, expectedRevision, input] of passos) {
      await request(app)
        .post(`/api/conversations/${id}/interactions`)
        .send({ actionId: `${contato(id)}_${actionId}`, expectedRevision, input });
    }
    return { id, revisao: 3 };
  }

  function contato(id: string) {
    return id;
  }

  async function escolher(id: string, actionId: string, expectedRevision: number, slotId: string) {
    return request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({ actionId, expectedRevision, input: { type: 'select_slot', slotId } });
  }

  async function identificar(
    id: string,
    actionId: string,
    expectedRevision: number,
    nome: string,
    nascimento: string,
  ) {
    return request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId,
        expectedRevision,
        input: { type: 'submit_patient', patient: { name: nome, birthDate: nascimento } },
      });
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

  it('escolher o horário pede nome e nascimento, e a identificação conclui a reserva (VAL-05)', async () => {
    await agenda('Dermatologia', ['2026-11-11T09:00:00-03:00']);
    const { id, revisao } = await ateHorarios('Dermatologia');
    const { body: horarios } = await request(app).get(`/api/conversations/${id}`);
    const slot = horarios.view.slots[0].id as string;

    const escolhido = await escolher(id, 'a4', revisao, slot);
    expect(escolhido.status).toBe(200);
    expect(escolhido.body.conversation.step).toBe('patient_data');
    expect(escolhido.body.view).toMatchObject({
      type: 'patient_form',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'birthDate', type: 'date', required: true },
      ],
      selectedSlot: { id: slot, startsAt: '2026-11-11T09:00:00-03:00' },
    });
    expect(await contar(`SELECT count(*) FROM reserva`)).toBe(0);

    const confirmado = await identificar(id, 'a5', revisao + 1, 'Ana Silva', '1998-04-15');
    expect(confirmado.status).toBe(200);
    expect(confirmado.body.conversation).toMatchObject({ step: 'menu', attemptId: null });
    expect(confirmado.body.result).toMatchObject({
      type: 'appointment_confirmed',
      appointment: {
        conversationId: id,
        slotId: slot,
        status: 'pending',
        startsAt: '2026-11-11T09:00:00-03:00',
        endsAt: '2026-11-11T09:30:00-03:00',
      },
    });
    expect(confirmado.body.messages.map((m: { text: string }) => m.text)).toEqual([
      'Consulta confirmada para 11/11 às 09h.',
      'Posso ajudar em mais alguma coisa?',
    ]);
    expect(await contar(`SELECT count(*) FROM reserva WHERE cancelada_em IS NULL`)).toBe(1);
    expect(await contar(`SELECT count(*) FROM paciente`)).toBe(1);
  });

  it('grava SELECTED_SLOT e APPOINTMENT_CONFIRMED, e fecha a tentativa com resultado confirmed', async () => {
    await agenda('Dermatologia', ['2026-11-11T09:00:00-03:00']);
    const { id, revisao } = await ateHorarios('Dermatologia');
    const slot = (await request(app).get(`/api/conversations/${id}`)).body.view.slots[0]
      .id as string;
    await escolher(id, 'a4', revisao, slot);
    await identificar(id, 'a5', revisao + 1, 'Ana Silva', '1998-04-15');

    const eventos = await pool.query<{ tipo: string }>(
      'SELECT tipo FROM evento_conversa ORDER BY id_evento',
    );
    expect(eventos.rows.map((e) => e.tipo)).toEqual([
      'STARTED_SCHEDULING',
      'ANSWERED_SPECIALTY',
      'SLOT_SEARCH_RESULT',
      'SELECTED_SLOT',
      'APPOINTMENT_CONFIRMED',
    ]);
    expect(
      await contar(
        `SELECT count(*) FROM tentativa WHERE resultado = 'confirmed' AND finalizada_em IS NOT NULL`,
      ),
    ).toBe(1);
  });

  it('a segunda reserva da mesma conversa não pede nome nem nascimento de novo (VAL-41)', async () => {
    await agenda('Dermatologia', ['2026-11-11T09:00:00-03:00', '2026-11-12T14:00:00-03:00']);
    const { id, revisao } = await ateHorarios('Dermatologia');
    const primeiro = (await request(app).get(`/api/conversations/${id}`)).body.view.slots[0]
      .id as string;
    await escolher(id, 'a4', revisao, primeiro);
    await identificar(id, 'a5', revisao + 1, 'Ana Silva', '1998-04-15');

    // Nova tentativa: menu, especialidade, visita, horário.
    const passos: [string, object][] = [
      ['b1', { type: 'select_option', optionId: 'opt_schedule' }],
      ['b2', { type: 'select_option', optionId: `sp_${await especialidadeId('Dermatologia')}` }],
      ['b3', { type: 'select_option', optionId: 'opt_return' }],
    ];
    let revisaoAtual = revisao + 2;
    for (const [actionId, input] of passos) {
      const r = await request(app)
        .post(`/api/conversations/${id}/interactions`)
        .send({ actionId, expectedRevision: revisaoAtual, input });
      revisaoAtual = r.body.conversation.revision;
    }
    const segundo = (await request(app).get(`/api/conversations/${id}`)).body.view.slots[0]
      .id as string;

    const res = await escolher(id, 'b4', revisaoAtual, segundo);
    expect(res.status).toBe(200);
    expect(res.body.conversation.step).toBe('menu');
    expect(res.body.result.type).toBe('appointment_confirmed');
    expect(await contar(`SELECT count(*) FROM paciente`)).toBe(1);
    expect(await contar(`SELECT count(*) FROM reserva WHERE cancelada_em IS NULL`)).toBe(2);
  });

  it('o paciente não é reaproveitado entre conversas diferentes (RN-06)', async () => {
    await agenda('Dermatologia', ['2026-11-11T09:00:00-03:00', '2026-11-12T14:00:00-03:00']);
    const primeira = await ateHorarios('Dermatologia');
    const slot1 = (await request(app).get(`/api/conversations/${primeira.id}`)).body.view.slots[0]
      .id as string;
    await escolher(primeira.id, 'a4', primeira.revisao, slot1);
    await identificar(primeira.id, 'a5', primeira.revisao + 1, 'Ana Silva', '1998-04-15');

    const segunda = await ateHorarios('Dermatologia');
    const slot2 = (await request(app).get(`/api/conversations/${segunda.id}`)).body.view.slots[0]
      .id as string;
    await escolher(segunda.id, 'a4', segunda.revisao, slot2);
    const confirmado = await identificar(
      segunda.id,
      'a5',
      segunda.revisao + 1,
      'Ana Silva',
      '1998-04-15',
    );

    expect(confirmado.body.result.type).toBe('appointment_confirmed');
    expect(await contar(`SELECT count(*) FROM paciente`)).toBe(2);
  });

  it('nome vazio e data futura são recusados sem gravar nada (INVALID_NAME e INVALID_BIRTH_DATE)', async () => {
    await agenda('Dermatologia', ['2026-11-11T09:00:00-03:00']);
    const { id, revisao } = await ateHorarios('Dermatologia');
    const slot = (await request(app).get(`/api/conversations/${id}`)).body.view.slots[0]
      .id as string;
    await escolher(id, 'a4', revisao, slot);

    const semNome = await identificar(id, 'a5', revisao + 1, '   ', '1998-04-15');
    expect(semNome.status).toBe(400);
    expect(semNome.body.error).toMatchObject({
      code: 'INVALID_NAME',
      fields: { 'patient.name': expect.any(String) },
    });

    const futuro = await identificar(id, 'a6', revisao + 1, 'Ana', '2026-12-01');
    expect(futuro.body.error.code).toBe('INVALID_BIRTH_DATE');

    expect(await contar(`SELECT revisao FROM conversa`)).toBe(revisao + 1);
    expect(await contar(`SELECT count(*) FROM paciente`)).toBe(0);
  });

  it('reenviar a confirmação não cria segundo paciente nem segunda reserva', async () => {
    await agenda('Dermatologia', ['2026-11-11T09:00:00-03:00']);
    const { id, revisao } = await ateHorarios('Dermatologia');
    const slot = (await request(app).get(`/api/conversations/${id}`)).body.view.slots[0]
      .id as string;
    await escolher(id, 'a4', revisao, slot);

    const primeira = await identificar(id, 'a5', revisao + 1, 'Ana Silva', '1998-04-15');
    const reenvio = await identificar(id, 'a5', revisao + 1, 'Ana Silva', '1998-04-15');

    expect(reenvio.status).toBe(200);
    expect(reenvio.body).toEqual(primeira.body);
    expect(await contar(`SELECT count(*) FROM paciente`)).toBe(1);
    expect(await contar(`SELECT count(*) FROM reserva`)).toBe(1);
  });

  it('um horário reservado depois da oferta não é escolhido (SLOT_UNAVAILABLE com nova tela)', async () => {
    const [horario] = await agenda('Dermatologia', ['2026-11-11T09:00:00-03:00']);
    const { id, revisao } = await ateHorarios('Dermatologia');
    const slot = (await request(app).get(`/api/conversations/${id}`)).body.view.slots[0]
      .id as string;

    // Outra conversa reserva o horário depois da oferta.
    await request(app).post('/api/conversations').send({ contactId: 'outra_conversa' });
    const { rows: p } = await pool.query<{ id: number }>(
      `INSERT INTO paciente (nome, data_nascimento) VALUES ('Outra Pessoa', '1990-01-01') RETURNING id_paciente AS id`,
    );
    await pool.query(
      `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em)
       SELECT $1, $2, id_conversa, now() FROM conversa WHERE contato = 'outra_conversa'`,
      [horario, p[0]!.id],
    );

    const res = await escolher(id, 'a4', revisao, slot);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect(res.body.view).toEqual({
      type: 'options',
      searchResult: 'no_slots',
      options: [{ id: 'opt_continue', label: 'Continuar' }],
    });
    expect(
      await contar(`SELECT count(*) FROM tentativa WHERE id_horario_selecionado IS NOT NULL`),
    ).toBe(0);
  });

  it('duas conversas disputam o mesmo horário: uma confirma e a outra recebe 409 (VAL-07)', async () => {
    await agenda('Dermatologia', ['2026-11-11T09:00:00-03:00']);
    const a = await ateHorarios('Dermatologia');
    const b = await ateHorarios('Dermatologia');
    const slot = (await request(app).get(`/api/conversations/${a.id}`)).body.view.slots[0]
      .id as string;

    // As duas escolhem o horário enquanto ele ainda está livre.
    await escolher(a.id, 'a4', a.revisao, slot);
    await escolher(b.id, 'a4', b.revisao, slot);

    const respostas = await Promise.all([
      identificar(a.id, 'a5', a.revisao + 1, 'Ana Silva', '1998-04-15'),
      identificar(b.id, 'a5', b.revisao + 1, 'Bruno Costa', '1990-05-01'),
    ]);

    expect(respostas.map((r) => r.status).sort()).toEqual([200, 409]);
    const perdedora = respostas.find((r) => r.status === 409)!;
    expect(perdedora.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect(await contar(`SELECT count(*) FROM reserva WHERE cancelada_em IS NULL`)).toBe(1);
    expect(await contar(`SELECT count(*) FROM paciente`)).toBe(1);
  });
});
