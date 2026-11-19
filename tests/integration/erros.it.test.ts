import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../../src/app';
import { fixedClock } from '../../src/shared/clock';

const NOW = '2026-11-10T15:15:00Z';

/** Pool apontando para uma porta fechada: cada consulta falha com ECONNREFUSED. */
const poolFechado = new Pool({
  host: '127.0.0.1',
  port: 1,
  user: 'nenhum',
  password: 'nenhum',
  database: 'nenhum',
  connectionTimeoutMillis: 2_000,
});

/** Pool que falha com uma mensagem que contém um dado sensível. */
const poolQueFalha = {
  query: async () => {
    throw new Error('falha no SELECT com contato 5511999999999');
  },
} as unknown as Pool;

afterAll(async () => {
  await poolFechado.end();
});

describe('erros HTTP e logs (fase 9a)', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responde 404 em JSON para rota desconhecida, com o requestId no cabeçalho', async () => {
    const app = buildApp({ pool: poolFechado, clock: fixedClock(NOW), corsOrigins: [] });
    const response = await request(app).get('/api/inexistente');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: 'Rota não encontrada.' },
    });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reaproveita um X-Request-Id válido e troca um inválido', async () => {
    const app = buildApp({ pool: poolFechado, clock: fixedClock(NOW), corsOrigins: [] });
    const valido = await request(app).get('/health').set('X-Request-Id', 'chamada-42');
    expect(valido.headers['x-request-id']).toBe('chamada-42');

    const invalido = await request(app).get('/health').set('X-Request-Id', 'a'.repeat(80));
    expect(invalido.headers['x-request-id']).not.toBe('a'.repeat(80));
    expect(invalido.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('responde 413 PAYLOAD_TOO_LARGE para corpo acima do limite', async () => {
    const app = buildApp({ pool: poolFechado, clock: fixedClock(NOW), corsOrigins: [] });
    const grande = JSON.stringify({ contactId: 'x'.repeat(200_000) });
    const response = await request(app)
      .post('/api/conversations')
      .set('Content-Type', 'application/json')
      .send(grande);
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('responde 400 INVALID_JSON para corpo que não é JSON', async () => {
    const app = buildApp({ pool: poolFechado, clock: fixedClock(NOW), corsOrigins: [] });
    const response = await request(app)
      .post('/api/conversations')
      .set('Content-Type', 'application/json')
      .send('{ isto não é json');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('responde 503 SERVICE_UNAVAILABLE quando o banco está fora, sem expor a conexão', async () => {
    const app = buildApp({ pool: poolFechado, clock: fixedClock(NOW), corsOrigins: [] });
    const response = await request(app).get('/api/clinic');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('127.0.0.1');
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
  });

  it('responde 500 INTERNAL_ERROR sem vazar a mensagem interna, e registra o erro sem valores de entrada', async () => {
    const app = buildApp({ pool: poolQueFalha, clock: fixedClock(NOW), corsOrigins: [] });
    const response = await request(app).get('/api/clinic').set('X-Request-Id', 'rastreio-7');

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Erro interno. Tente novamente.',
    });
    expect(JSON.stringify(response.body)).not.toContain('5511999999999');

    expect(logs).toHaveLength(1);
    const entrada = JSON.parse(logs[0]!);
    expect(entrada).toMatchObject({
      level: 'error',
      time: '2026-11-10T15:15:00.000Z',
      requestId: 'rastreio-7',
      status: 500,
      errorName: 'Error',
    });
    expect(logs[0]).not.toContain('5511999999999');
  });

  it('não registra erros de cliente em log de servidor', async () => {
    const app = buildApp({ pool: poolFechado, clock: fixedClock(NOW), corsOrigins: [] });
    await request(app).get('/api/inexistente');
    expect(logs).toHaveLength(0);
  });
});
