import request from 'supertest';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app';
import { fixedClock } from '../../src/shared/clock';
import { assertOpenApiResponse, assertSchema, openapi } from '../support/openapi';

/** Contratos HTTP sem banco: saúde e erros anteriores à execução das regras de negócio. */
function testApp() {
  const query = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error('indisponível'), { code: 'ECONNREFUSED' }));
  const app = buildApp({
    pool: { query } as unknown as Pool,
    clock: fixedClock('2026-11-10T15:00:00Z'),
    corsOrigins: [],
  });
  return { app, query };
}

describe('OpenAPI contra respostas HTTP sem banco', () => {
  it('valida saúde e correlação sem consultar o banco', async () => {
    const { app, query } = testApp();
    const res = await request(app).get('/health').set('X-Request-Id', 'openapi-health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('openapi-health');
    assertOpenApiResponse('GET', '/health', res.status, res.body, res.headers);
    expect(query).not.toHaveBeenCalled();
  });

  it('valida JSON inválido, entrada ausente e excesso de corpo antes de acessar o banco', async () => {
    const { app, query } = testApp();
    const cases = [
      { body: '{', status: 400, code: 'INVALID_JSON' },
      { body: '{}', status: 400, code: 'MISSING_PARAMETER' },
      {
        body: JSON.stringify({ contactId: 'a'.repeat(110_000) }),
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
      },
    ];
    for (const scenario of cases) {
      const res = await request(app)
        .post('/api/conversations')
        .set('Content-Type', 'application/json')
        .send(scenario.body);
      expect(res.status).toBe(scenario.status);
      expect(res.body.error.code).toBe(scenario.code);
      assertOpenApiResponse('POST', '/api/conversations', res.status, res.body, res.headers);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('valida parâmetros e identificadores recusados antes da consulta ao banco', async () => {
    const { app, query } = testApp();
    for (const [url, status] of [
      ['/api/dashboard?month=2026-13', 400],
      ['/api/calendar?startDate=2026-11-10&endDateExclusive=2026-11-01', 400],
      ['/api/analytics?period=month&reference=2027-01', 400],
      ['/api/conversations/valor-invalido', 404],
    ] as const) {
      const res = await request(app).get(url);
      expect(res.status).toBe(status);
      assertOpenApiResponse('GET', url, res.status, res.body, res.headers);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('valida o envelope geral para rotas inexistentes sem inventar uma operação', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/inexistente');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    assertSchema(openapi.components.schemas.ErrorResponse!, res.body, 'rota inexistente');
  });

  it('valida indisponibilidade sem expor a falha interna no contrato', async () => {
    const { app } = testApp();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app).get('/api/clinic');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      assertOpenApiResponse('GET', '/api/clinic', res.status, res.body, res.headers);
    } finally {
      log.mockRestore();
    }
  });
});
