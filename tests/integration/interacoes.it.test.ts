import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { clinicaBasica, resetClinica } from '../support/cenarios';
import { startPostgres } from '../support/postgres';

const T0 = '2026-11-10T15:00:00Z'; // 12:00 em America/Sao_Paulo
const UMA_HORA = 60 * 60 * 1000;

describe('interações do bot: pipeline, revisão, idempotência e fluxo de agendamento', () => {
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

  async function novaConversa(): Promise<string> {
    const res = await request(app).post('/api/conversations').send({ contactId: 'contact_1' });
    return res.body.conversation.id as string;
  }

  function acao(actionId: string, expectedRevision: number, input: object) {
    return { actionId, expectedRevision, input };
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
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('o agendamento leva do menu à visita em três perguntas, sem terceira triagem (VAL-03)', async () => {
    const id = await novaConversa();

    const menu = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'select_option', optionId: 'opt_schedule' }));
    expect(menu.status).toBe(200);
    expect(menu.body.conversation).toMatchObject({
      revision: 1,
      step: 'specialty',
      attemptId: 'attempt_1',
    });
    expect(menu.body.view.options.map((o: { id: string }) => o.id)).toEqual([
      'sp_1',
      'sp_2',
      'sp_3',
      'sp_4',
    ]);
    expect(menu.body.messages[0].text).toBe('Qual especialidade procura?');

    const especialidade = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_2', 1, { type: 'select_option', optionId: 'sp_2' }));
    expect(especialidade.body.conversation).toMatchObject({ revision: 2, step: 'visit_kind' });
    expect(especialidade.body.messages[0].text).toBe(
      'É primeira consulta ou retorno em Dermatologia?',
    );
    expect(especialidade.body.view.options).toEqual([
      { id: 'opt_first_visit', label: 'Primeira consulta' },
      { id: 'opt_return', label: 'Retorno' },
    ]);

    const visita = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_3', 2, { type: 'select_option', optionId: 'opt_return' }));
    // Sem agenda cadastrada, a busca volta vazia e o passo vai ao aviso de continuação (fase 5c).
    expect(visita.body.conversation).toMatchObject({
      revision: 3,
      step: 'continue_after_no_slots',
    });
    expect(visita.body.view).toEqual({
      type: 'options',
      searchResult: 'no_slots',
      options: [{ id: 'opt_continue', label: 'Continuar' }],
    });
  });

  it('registra a tentativa, a especialidade, o tipo de visita e os eventos do funil', async () => {
    const id = await novaConversa();
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('a1', 0, { type: 'select_option', optionId: 'opt_schedule' }));
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('a2', 1, { type: 'select_option', optionId: 'sp_2' }));
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('a3', 2, { type: 'select_option', optionId: 'opt_first_visit' }));

    const { rows } = await pool.query<{
      numero: number;
      id_especialidade: number;
      tipo_visita: string;
    }>('SELECT numero, id_especialidade, tipo_visita FROM tentativa');
    expect(rows).toEqual([{ numero: 1, id_especialidade: 2, tipo_visita: 'primeira_consulta' }]);

    const eventos = await pool.query<{ tipo: string }>(
      'SELECT tipo FROM evento_conversa ORDER BY id_evento',
    );
    expect(eventos.rows.map((e) => e.tipo)).toEqual([
      'STARTED_SCHEDULING',
      'ANSWERED_SPECIALTY',
      'SLOT_SEARCH_RESULT',
    ]);
  });

  it('o reenvio da mesma ação devolve o mesmo resultado, sem avançar (ADR-0006)', async () => {
    const id = await novaConversa();
    const corpo = acao('act_1', 0, { type: 'select_option', optionId: 'opt_schedule' });

    const primeira = await request(app).post(`/api/conversations/${id}/interactions`).send(corpo);
    const reenvio = await request(app).post(`/api/conversations/${id}/interactions`).send(corpo);

    expect(reenvio.status).toBe(200);
    expect(reenvio.body).toEqual(primeira.body);
    expect(await contar(`SELECT count(*) FROM tentativa`)).toBe(1);
    expect(await contar(`SELECT count(*) FROM evento_conversa`)).toBe(1);
  });

  it('o mesmo actionId com conteúdo diferente é conflito (409 ACTION_ID_CONFLICT)', async () => {
    const id = await novaConversa();
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'select_option', optionId: 'opt_schedule' }));

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'select_option', optionId: 'opt_clinic_info' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTION_ID_CONFLICT');
  });

  it('revisão antiga com ação nova é recusada sem alterar o estado (409 STALE_CONVERSATION_STATE)', async () => {
    const id = await novaConversa();
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'select_option', optionId: 'opt_schedule' }));

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_2', 0, { type: 'select_option', optionId: 'sp_1' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_CONVERSATION_STATE');
    expect(await contar(`SELECT revisao FROM conversa`)).toBe(1);
  });

  it('opção de especialidade inválida é recusada sem consumir a revisão nem gravar a ação', async () => {
    const id = await novaConversa();
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'select_option', optionId: 'opt_schedule' }));

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_2', 1, { type: 'select_option', optionId: 'sp_99' }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_OPTION');
    expect(await contar(`SELECT revisao FROM conversa`)).toBe(1);
    expect(await contar(`SELECT count(*) FROM acao_processada WHERE action_id = 'act_2'`)).toBe(0);
  });

  it('input que o passo não aceita é recusado com ACTION_NOT_ALLOWED_IN_STEP (422)', async () => {
    const id = await novaConversa();
    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(
        acao('act_1', 0, {
          type: 'submit_patient',
          patient: { name: 'Ana', birthDate: '1998-04-15' },
        }),
      );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ACTION_NOT_ALLOWED_IN_STEP');
  });

  it('envios simultâneos da mesma ação são processados uma vez só (VAL-40)', async () => {
    const id = await novaConversa();
    const corpo = acao('act_corrida', 0, { type: 'select_option', optionId: 'opt_schedule' });

    const respostas = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post(`/api/conversations/${id}/interactions`).send(corpo),
      ),
    );

    expect(respostas.every((r) => r.status === 200)).toBe(true);
    for (const r of respostas) expect(r.body).toEqual(respostas[0]!.body);
    expect(await contar(`SELECT count(*) FROM tentativa`)).toBe(1);
    expect(await contar(`SELECT revisao FROM conversa`)).toBe(1);
  });

  it('ações diferentes com a mesma revisão: uma avança e a outra é recusada (VAL-40)', async () => {
    const id = await novaConversa();
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'select_option', optionId: 'opt_schedule' }));

    const respostas = await Promise.all([
      request(app)
        .post(`/api/conversations/${id}/interactions`)
        .send(acao('act_2', 1, { type: 'select_option', optionId: 'sp_1' })),
      request(app)
        .post(`/api/conversations/${id}/interactions`)
        .send(acao('act_3', 1, { type: 'select_option', optionId: 'sp_2' })),
    ]);

    expect(respostas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await contar(`SELECT revisao FROM conversa`)).toBe(2);
  });

  it('Sair encerra a conversa, incrementa a revisão e fecha a tentativa', async () => {
    const id = await novaConversa();
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'select_option', optionId: 'opt_schedule' }));

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_2', 1, { type: 'exit' }));

    expect(res.status).toBe(200);
    expect(res.body.conversation).toMatchObject({
      effectiveStatus: 'closed',
      revision: 2,
      step: 'closed',
    });
    expect(res.body.view).toEqual({ type: 'closed' });
    expect(res.body.availableActions).toEqual([]);
    expect(res.body.messages[0].text).toBe('Até logo!');
    expect(
      await contar(
        `SELECT count(*) FROM tentativa WHERE resultado = 'exited' AND finalizada_em IS NOT NULL`,
      ),
    ).toBe(1);
    expect(await contar(`SELECT count(*) FROM evento_conversa WHERE tipo = 'EXITED'`)).toBe(1);

    const { rows } = await pool.query<{ encerramento_motivo: string; encerramento_etapa: string }>(
      'SELECT encerramento_motivo, encerramento_etapa FROM conversa',
    );
    expect(rows[0]).toEqual({ encerramento_motivo: 'exited', encerramento_etapa: 'triage' });
  });

  it('conversa encerrada recusa novas ações (409 CONVERSATION_CLOSED)', async () => {
    const id = await novaConversa();
    await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'exit' }));

    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_2', 1, { type: 'select_option', optionId: 'opt_schedule' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONVERSATION_CLOSED');
  });

  it('conversa inativa por mais de uma hora recusa ações (409 CONVERSATION_ABANDONED)', async () => {
    const id = await novaConversa();
    const depois = appEm(new Date(Date.parse(T0) + UMA_HORA + 1000).toISOString());

    const res = await request(depois)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'select_option', optionId: 'opt_schedule' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONVERSATION_ABANDONED');
    expect(await contar(`SELECT revisao FROM conversa`)).toBe(0);
  });

  it('responde 404 para conversa inexistente e 400 para corpo sem campos obrigatórios', async () => {
    const naoExiste = await request(app)
      .post('/api/conversations/cv_999/interactions')
      .send(acao('act_1', 0, { type: 'exit' }));
    expect(naoExiste.body.error.code).toBe('CONVERSATION_NOT_FOUND');

    const id = await novaConversa();
    const semCampos = await request(app).post(`/api/conversations/${id}/interactions`).send({});
    expect(semCampos.status).toBe(400);
    expect(semCampos.body.error.code).toBe('MISSING_PARAMETER');
  });

  it('recusa tipo de entrada desconhecido com INVALID_INPUT_TYPE', async () => {
    const id = await novaConversa();
    const res = await request(app)
      .post(`/api/conversations/${id}/interactions`)
      .send(acao('act_1', 0, { type: 'tipo_inventado' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT_TYPE');
  });
});
