import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { startPostgres } from '../support/postgres';

const T0 = '2026-11-10T15:00:00Z'; // 12:00 em America/Sao_Paulo
const UMA_HORA = 60 * 60 * 1000;

const OPCOES_MENU = [
  { id: 'opt_schedule', label: 'Agendar uma consulta' },
  { id: 'opt_clinic_info', label: 'Ver informações da clínica' },
  { id: 'opt_appointments', label: 'Ver ou cancelar um agendamento' },
];

describe('conversas: criação, leitura e listagem', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;

  function appEm(instante: string) {
    return buildApp({
      pool,
      clock: fixedClock(instante),
      corsOrigins: ['http://localhost:5173'],
    });
  }

  async function contar(sql: string): Promise<number> {
    const { rows } = await pool.query<{ n: number }>(`SELECT (${sql})::int AS n`);
    return rows[0]!.n;
  }

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
    app = appEm(T0);
  }, 180_000);

  beforeEach(async () => {
    await pool.query('TRUNCATE conversa RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  describe('POST /api/conversations', () => {
    it('cria a conversa com boas-vindas, menu e a ação exit (VAL-02)', async () => {
      const res = await request(app).post('/api/conversations').send({ contactId: 'contact_1' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        conversation: {
          id: 'cv_1',
          effectiveStatus: 'active',
          revision: 0,
          step: 'menu',
          attemptId: null,
        },
        messages: [
          {
            id: 'msg_1',
            author: 'bot',
            text: 'Olá! Sou o assistente Kenko. Como posso ajudar?',
            sentAt: '2026-11-10T12:00:00-03:00',
          },
        ],
        view: { type: 'options', options: OPCOES_MENU },
        availableActions: ['exit'],
      });
    });

    it('repetir com o mesmo contactId devolve a conversa existente, sem nova mensagem', async () => {
      const primeira = await request(app)
        .post('/api/conversations')
        .send({ contactId: 'contact_1' });
      const segunda = await request(app)
        .post('/api/conversations')
        .send({ contactId: 'contact_1' });

      expect(segunda.status).toBe(200);
      expect(segunda.body.conversation.id).toBe(primeira.body.conversation.id);
      expect(segunda.body.messages).toEqual([]);
      expect(await contar(`SELECT count(*) FROM interacao`)).toBe(1);
      expect(await contar(`SELECT count(*) FROM conversa`)).toBe(1);
    });

    it('contatos diferentes geram conversas independentes (VAL-01)', async () => {
      const a = await request(app).post('/api/conversations').send({ contactId: 'contact_1' });
      const b = await request(app).post('/api/conversations').send({ contactId: 'contact_2' });

      expect(a.body.conversation.id).not.toBe(b.body.conversation.id);
      expect(a.body.conversation.effectiveStatus).toBe('active');
      expect(b.body.conversation.effectiveStatus).toBe('active');
    });

    it('envios simultâneos do mesmo contato criam uma única conversa (VAL-40)', async () => {
      const respostas = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app).post('/api/conversations').send({ contactId: 'contact_corrida' }),
        ),
      );

      expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respostas.every((r) => r.body.conversation.id === 'cv_1')).toBe(true);
      expect(await contar(`SELECT count(*) FROM conversa`)).toBe(1);
      expect(await contar(`SELECT count(*) FROM interacao`)).toBe(1);
    });

    it('recusa corpo sem contactId com MISSING_PARAMETER', async () => {
      const res = await request(app).post('/api/conversations').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_PARAMETER');
      expect(res.body.error.fields).toEqual({ contactId: 'Obrigatório.' });
    });

    it('recusa contactId vazio ou longo demais com INVALID_INPUT_TYPE', async () => {
      const vazio = await request(app).post('/api/conversations').send({ contactId: '' });
      const longo = await request(app)
        .post('/api/conversations')
        .send({ contactId: 'x'.repeat(65) });
      expect(vazio.body.error.code).toBe('INVALID_INPUT_TYPE');
      expect(longo.body.error.code).toBe('INVALID_INPUT_TYPE');
    });

    it('não exige autenticação (VAL-25)', async () => {
      const res = await request(app).post('/api/conversations').send({ contactId: 'contact_1' });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe('GET /api/conversations/{id}', () => {
    it('devolve o estado e a interface atual, sem efeitos colaterais (VAL-39)', async () => {
      await request(app).post('/api/conversations').send({ contactId: 'contact_1' });
      const antes = await pool.query(`SELECT ultima_interacao FROM conversa WHERE id_conversa = 1`);

      // Leitura um pouco depois: não pode renovar a atividade nem gerar mensagens.
      const depois = appEm('2026-11-10T15:20:00Z');
      const res = await request(depois).get('/api/conversations/cv_1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        conversation: {
          id: 'cv_1',
          effectiveStatus: 'active',
          revision: 0,
          step: 'menu',
          attemptId: null,
          startedAt: '2026-11-10T12:00:00-03:00',
          lastInteractionAt: '2026-11-10T12:00:00-03:00',
        },
        view: { type: 'options', options: OPCOES_MENU },
        availableActions: ['exit'],
      });
      const depoisDb = await pool.query(
        `SELECT ultima_interacao FROM conversa WHERE id_conversa = 1`,
      );
      expect(depoisDb.rows[0]).toEqual(antes.rows[0]);
      expect(await contar(`SELECT count(*) FROM interacao`)).toBe(1);
    });

    it('responde 404 para conversa inexistente ou identificador malformado', async () => {
      const inexistente = await request(app).get('/api/conversations/cv_999');
      const malformado = await request(app).get('/api/conversations/xyz');
      expect(inexistente.body.error.code).toBe('CONVERSATION_NOT_FOUND');
      expect(malformado.status).toBe(404);
    });

    it('marca como abandonada depois de mais de uma hora sem atividade (VAL-12)', async () => {
      await request(app).post('/api/conversations').send({ contactId: 'contact_1' });

      const exatamenteUmaHora = await request(
        appEm(new Date(Date.parse(T0) + UMA_HORA).toISOString()),
      ).get('/api/conversations/cv_1');
      const umSegundoDepois = await request(
        appEm(new Date(Date.parse(T0) + UMA_HORA + 1000).toISOString()),
      ).get('/api/conversations/cv_1');

      expect(exatamenteUmaHora.body.conversation.effectiveStatus).toBe('active');
      expect(umSegundoDepois.body.conversation.effectiveStatus).toBe('abandoned');
      expect(umSegundoDepois.body.availableActions).toEqual([]);
    });

    it('mostra a conversa como encerrada quando há Sair registrado', async () => {
      await request(app).post('/api/conversations').send({ contactId: 'contact_1' });
      await pool.query(
        `UPDATE conversa SET encerrada_em = $1, encerramento_motivo = 'exited'
          WHERE id_conversa = 1`,
        ['2026-11-10T15:05:00Z'],
      );
      await pool.query(
        `UPDATE conversa SET id_passo_atual = (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'closed')
          WHERE id_conversa = 1`,
      );

      const res = await request(appEm('2026-11-10T18:00:00Z')).get('/api/conversations/cv_1');
      expect(res.body.conversation.effectiveStatus).toBe('closed');
      expect(res.body.view).toEqual({ type: 'closed' });
      expect(res.body.availableActions).toEqual([]);
    });
  });

  describe('GET /api/conversations?ids=', () => {
    it('exige o parâmetro ids com MISSING_PARAMETER', async () => {
      const res = await request(app).get('/api/conversations');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_PARAMETER');
    });

    it('recusa mais de 50 IDs e formatos inválidos com INVALID_IDS', async () => {
      const muitos = Array.from({ length: 51 }, (_, i) => `cv_${i + 1}`).join(',');
      const malformado = await request(app).get('/api/conversations').query({ ids: 'cv_1,abc' });
      const vazio = await request(app).get('/api/conversations').query({ ids: '' });

      expect(
        (await request(app).get('/api/conversations').query({ ids: muitos })).body.error.code,
      ).toBe('INVALID_IDS');
      expect(malformado.body.error.code).toBe('INVALID_IDS');
      expect(vazio.body.error.code).toBe('INVALID_IDS');
    });

    it('omite IDs inexistentes e mantém a ordem pedida, com o estado efetivo de cada uma', async () => {
      await request(app).post('/api/conversations').send({ contactId: 'contact_1' });
      await request(app).post('/api/conversations').send({ contactId: 'contact_2' });

      const res = await request(appEm(new Date(Date.parse(T0) + UMA_HORA + 1000).toISOString()))
        .get('/api/conversations')
        .query({ ids: 'cv_2,cv_99,cv_1' });

      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({
        timezone: 'America/Sao_Paulo',
        evaluatedAt: '2026-11-10T13:00:01-03:00',
      });
      expect(res.body.data).toEqual([
        {
          id: 'cv_2',
          effectiveStatus: 'abandoned',
          lastInteractionAt: '2026-11-10T12:00:00-03:00',
        },
        {
          id: 'cv_1',
          effectiveStatus: 'abandoned',
          lastInteractionAt: '2026-11-10T12:00:00-03:00',
        },
      ]);
    });
  });
});
