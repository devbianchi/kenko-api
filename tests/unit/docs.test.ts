import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app';
import { DocsService } from '../../src/services/docs.service';
import { fixedClock } from '../../src/shared/clock';
import { assertOpenApiResponse } from '../support/openapi';

// Documento mínimo real, sem depender de um build anterior nem de fixtures de demonstração.
const document = {
  openapi: '3.1.0',
  info: { title: 'Kenko API — teste', version: '0.1.0', description: 'Descrição preservada.' },
  paths: {
    '/health': {
      get: { responses: { '200': { description: 'Processo disponível.' } } },
    },
  },
  components: { schemas: { Example: { type: 'string' } } },
  tags: [{ name: 'Saúde' }],
};

describe('documento OpenAPI servido em /api/docs', () => {
  let directory: string;
  let file: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'kenko-docs-'));
    file = path.join(directory, 'openapi.json');
    writeFileSync(file, JSON.stringify(document));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('preserva todos os campos e mantém o documento carregado sem reler o disco', () => {
    const service = new DocsService(file);
    const loaded = service.getDocument();
    expect(loaded).toEqual(document);
    // Mesmo removido após a primeira leitura, o documento permanece disponível na instância.
    rmSync(file);
    expect(service.getDocument()).toBe(loaded);
  });

  it.each([
    ['JSON inválido', '{'],
    ['objeto fora do contrato', '{}'],
    ['info inválida', JSON.stringify({ ...document, info: { title: '', version: '0.1.0' } })],
    ['paths inválido', JSON.stringify({ ...document, paths: [] })],
  ])(
    'impede iniciar com %s e permite corrigir o arquivo antes de uma nova tentativa',
    (_label, body) => {
      writeFileSync(file, body);
      const service = new DocsService(file);
      expect(() => service.getDocument()).toThrow('Documento OpenAPI ausente ou inválido');
      writeFileSync(file, JSON.stringify(document));
      expect(service.getDocument()).toEqual(document);
    },
  );

  it('informa como gerar a documentação quando o bundle não existe', () => {
    rmSync(file);
    expect(() => new DocsService(file).getDocument()).toThrow('npm run docs:bundle');
  });

  it('retorna JSON direto, correlação e CORS sem consultar o banco', async () => {
    const query = vi.fn(() => {
      throw new Error('O endpoint não pode consultar o banco.');
    });
    const connect = vi.fn(() => {
      throw new Error('O endpoint não pode abrir conexão.');
    });
    const app = buildApp({
      pool: { query, connect } as unknown as Pool,
      clock: fixedClock('2026-11-10T15:00:00Z'),
      corsOrigins: ['http://localhost:5173'],
      docs: new DocsService(file),
    });
    const res = await request(app)
      .get('/api/docs')
      .set('Origin', 'http://localhost:5173')
      .set('X-Request-Id', 'docs-test');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['x-request-id']).toBe('docs-test');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.body).toEqual(document);
    expect(res.body).not.toHaveProperty('data');
    assertOpenApiResponse('GET', '/api/docs', res.status, res.body, res.headers);
    expect(query).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect((await request(app).get('/docs')).status).toBe(404);
  });

  it('usa o erro HTTP padrão se uma aplicação isolada recebe um serviço sem bundle', async () => {
    rmSync(file);
    const app = buildApp({
      pool: {} as Pool,
      clock: fixedClock('2026-11-10T15:00:00Z'),
      corsOrigins: [],
      docs: new DocsService(file),
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app).get('/api/docs');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' },
      });
      assertOpenApiResponse('GET', '/api/docs', res.status, res.body, res.headers);
    } finally {
      log.mockRestore();
    }
  });
});
