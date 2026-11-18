import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { clinicaBasica, resetClinica } from '../support/cenarios';
import { startPostgres } from '../support/postgres';

// Terça-feira, 10/11/2026, 12:00 em Brasília. A semana atual vai de 08/11 a 14/11; a próxima, de 15/11 a 21/11.
const T0 = '2026-11-10T15:00:00Z';

describe('busca de horários (fase 5c)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;

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

  /** Cria um médico com sala própria e os horários de 30 minutos pedidos. Devolve os ids dos horários. */
  async function agenda(especialidade: string, medico: string, sala: string, inicios: string[]) {
    const { rows: m } = await pool.query<{ id: number }>(
      `INSERT INTO medico (id_especialidade, nome_medico) VALUES ($1, $2) RETURNING id_medico AS id`,
      [await especialidadeId(especialidade), medico],
    );
    const { rows: s } = await pool.query<{ id: number }>(
      `INSERT INTO sala (id_clinica, nome)
       SELECT id_clinica, $1 FROM clinica LIMIT 1 RETURNING id_sala AS id`,
      [sala],
    );
    const ids: number[] = [];
    for (const inicio of inicios) {
      const { rows: h } = await pool.query<{ id: number }>(
        `INSERT INTO horario (id_medico, id_sala, inicio, fim)
         VALUES ($1, $2, $3, $3::timestamptz + interval '30 minutes') RETURNING id_horario AS id`,
        [m[0]!.id, s[0]!.id, inicio],
      );
      ids.push(h[0]!.id);
    }
    return ids;
  }

  async function novaConversaNaVisita(especialidade: string) {
    const conv = await request(app)
      .post('/api/conversations')
      .send({ contactId: `c_${Math.random()}` });
    const id = conv.body.conversation.id as string;
    const passos = [
      {
        actionId: 'a1',
        expectedRevision: 0,
        input: { type: 'select_option', optionId: 'opt_schedule' },
      },
      {
        actionId: 'a2',
        expectedRevision: 1,
        input: { type: 'select_option', optionId: `sp_${await especialidadeId(especialidade)}` },
      },
    ];
    for (const passo of passos) {
      await request(app).post(`/api/conversations/${id}/interactions`).send(passo);
    }
    return id;
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
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('oferece dois dias da semana atual e o mais próximo da seguinte, em ordem (VAL-04)', async () => {
    await agenda('Dermatologia', 'Dra. Helena', 'Sala 1', [
      '2026-11-10T11:00:00-03:00', // já passou
      '2026-11-10T13:00:00-03:00', // hoje, mais tarde
      '2026-11-11T09:00:00-03:00',
      '2026-11-11T10:00:00-03:00', // mesmo dia: não entra
      '2026-11-12T14:00:00-03:00',
      '2026-11-14T09:00:00-03:00', // terceiro dia da semana: não entra
      '2026-11-16T07:00:00-03:00', // próxima semana
      '2026-11-22T07:00:00-03:00', // semana seguinte à próxima: não entra
    ]);
    const id = await novaConversaNaVisita('Dermatologia');

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_first_visit' },
      });

    expect(res.status).toBe(200);
    expect(res.body.conversation.step).toBe('slot_selection');
    expect(res.body.view.searchResult).toBe('available');
    expect(res.body.view.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([
      '2026-11-10T13:00:00-03:00',
      '2026-11-11T09:00:00-03:00',
      '2026-11-16T07:00:00-03:00',
    ]);
    expect(res.body.view.slots[0]).toMatchObject({
      id: expect.stringMatching(/^slot_\d+$/),
      doctor: { id: expect.stringMatching(/^dr_\d+$/), name: 'Dra. Helena' },
      room: { id: expect.stringMatching(/^room_\d+$/), name: 'Sala 1' },
    });
  });

  it('não oferece horário reservado por reserva ativa (RN-16)', async () => {
    const [primeiro] = await agenda('Dermatologia', 'Dra. Helena', 'Sala 1', [
      '2026-11-10T13:00:00-03:00',
      '2026-11-11T09:00:00-03:00',
      '2026-11-12T14:00:00-03:00',
    ]);
    const id = await novaConversaNaVisita('Dermatologia');
    const { rows: p } = await pool.query<{ id: number }>(
      `INSERT INTO paciente (nome, data_nascimento) VALUES ('Outra Pessoa', '1990-01-01') RETURNING id_paciente AS id`,
    );
    await pool.query(
      `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em)
       SELECT $1, $2, id_conversa, now() FROM conversa WHERE contato LIKE 'c_%' LIMIT 1`,
      [primeiro, p[0]!.id],
    );

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_return' },
      });

    expect(res.body.view.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([
      '2026-11-11T09:00:00-03:00',
      '2026-11-12T14:00:00-03:00',
    ]);
  });

  it('mostra menos de três opções quando faltam dias, sem completar fora da distribuição (VAL-31)', async () => {
    await agenda('Cardiologia', 'Dra. Carla', 'Sala 2', ['2026-11-10T13:00:00-03:00']);
    const id = await novaConversaNaVisita('Cardiologia');

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_first_visit' },
      });

    expect(res.body.view.searchResult).toBe('available');
    expect(res.body.view.slots).toHaveLength(1);
  });

  it('sem horários: grava a busca vazia, avisa e oferece continuar (RN-21)', async () => {
    const id = await novaConversaNaVisita('Ortopedia');

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_first_visit' },
      });

    expect(res.body.conversation.step).toBe('continue_after_no_slots');
    expect(res.body.view).toEqual({
      type: 'options',
      searchResult: 'no_slots',
      options: [{ id: 'opt_continue', label: 'Continuar' }],
    });
    expect(await contar(`SELECT count(*) FROM busca_sem_horario`)).toBe(1);
    expect(
      await contar(`SELECT count(*) FROM evento_conversa WHERE tipo = 'SLOT_SEARCH_RESULT'`),
    ).toBe(1);
    expect(await contar(`SELECT count(*) FROM oferta_horario`)).toBe(0);
  });

  it('cada busca vazia conta, mesmo repetida na mesma conversa (VAL-11)', async () => {
    const id = await novaConversaNaVisita('Ortopedia');
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_first_visit' },
      });
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a4',
        expectedRevision: 3,
        input: { type: 'select_option', optionId: 'opt_continue' },
      });
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a5',
        expectedRevision: 4,
        input: { type: 'select_option', optionId: 'opt_schedule' },
      });
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a6',
        expectedRevision: 5,
        input: { type: 'select_option', optionId: `sp_${await especialidadeId('Ortopedia')}` },
      });
    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a7',
        expectedRevision: 6,
        input: { type: 'select_option', optionId: 'opt_return' },
      });

    expect(res.body.conversation.step).toBe('continue_after_no_slots');
    expect(await contar(`SELECT count(*) FROM busca_sem_horario`)).toBe(2);
    expect(await contar(`SELECT count(DISTINCT id_tentativa) FROM busca_sem_horario`)).toBe(2);
  });

  it('reexibir a conversa mostra a mesma oferta, sem nova busca nem evento (GET)', async () => {
    await agenda('Dermatologia', 'Dra. Helena', 'Sala 1', ['2026-11-10T13:00:00-03:00']);
    const id = await novaConversaNaVisita('Dermatologia');
    const feita = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_first_visit' },
      });
    const eventosAntes = await contar(`SELECT count(*) FROM evento_conversa`);

    const reexibida = await request(appEm('2026-11-10T15:10:00Z')).get(`/api/conversations/${id}`);

    expect(reexibida.body.view).toEqual(feita.body.view);
    expect(await contar(`SELECT count(*) FROM evento_conversa`)).toBe(eventosAntes);
  });

  it('recusa horário que não foi oferecido e aceita o oferecido, levando à identificação', async () => {
    const [oferecido] = await agenda('Dermatologia', 'Dra. Helena', 'Sala 1', [
      '2026-11-10T13:00:00-03:00',
    ]);
    const id = await novaConversaNaVisita('Dermatologia');
    const feita = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_first_visit' },
      });
    const slot = feita.body.view.slots[0].id as string;

    const naoOferecido = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a4',
        expectedRevision: 3,
        input: { type: 'select_slot', slotId: `slot_${oferecido! + 999}` },
      });
    expect(naoOferecido.body.error.code).toBe('INVALID_SLOT');

    const escolhido = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({ actionId: 'a5', expectedRevision: 3, input: { type: 'select_slot', slotId: slot } });
    expect(escolhido.status).toBe(200);
    expect(escolhido.body.conversation.step).toBe('patient_data');
    expect(escolhido.body.view.type).toBe('patient_form');
  });

  it('o horário da próxima semana entra só até sábado, e o domingo seguinte já é da semana seguinte', async () => {
    await agenda('Dermatologia', 'Dra. Helena', 'Sala 1', [
      '2026-11-15T07:00:00-03:00', // domingo da próxima semana: entra
      '2026-11-22T07:00:00-03:00', // fora
    ]);
    const id = await novaConversaNaVisita('Dermatologia');

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_first_visit' },
      });

    expect(res.body.view.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([
      '2026-11-15T07:00:00-03:00',
    ]);
  });

  it('a busca de horários não aceita especialidade sem médicos cadastrados como oferta', async () => {
    expect(await contar(`SELECT count(*) FROM medico`)).toBe(0);
    const id = await novaConversaNaVisita('Clínico geral');
    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send({
        actionId: 'a3',
        expectedRevision: 2,
        input: { type: 'select_option', optionId: 'opt_return' },
      });
    expect(res.body.conversation.step).toBe('continue_after_no_slots');
  });
});
