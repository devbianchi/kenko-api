import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { startPostgres } from '../support/postgres';

describe('API com PostgreSQL real', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
    app = buildApp({
      pool,
      clock: fixedClock('2026-11-10T15:00:00Z'),
      corsOrigins: ['http://localhost:5173'],
    });
  }, 180_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('aplica todas as migrations do diretório do zero', async () => {
    const esperadas = (await loadMigrations()).length;
    const { rows } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM schema_migrations',
    );
    expect(rows[0]?.n).toBe(esperadas);
  });

  it('GET /health responde 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/clinic responde 404 CLINIC_NOT_FOUND sem clínica cadastrada', async () => {
    const res = await request(app).get('/api/clinic');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLINIC_NOT_FOUND');
  });

  it('GET /api/clinic devolve a clínica no envelope com ID opaco quando existe', async () => {
    await pool.query(
      `INSERT INTO clinica (nome, endereco, telefone)
       VALUES ('Clínica Demonstração', 'Rua de Exemplo, 100', '1100000000')`,
    );

    const res = await request(app).get('/api/clinic');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({
      timezone: 'America/Sao_Paulo',
      evaluatedAt: '2026-11-10T12:00:00-03:00',
    });
    expect(res.body.data).toEqual({
      id: 'clinic_1',
      name: 'Clínica Demonstração',
      address: 'Rua de Exemplo, 100',
      phone: '1100000000',
    });
  });

  it('responde 400 INVALID_JSON para corpo malformado', async () => {
    const res = await request(app)
      .post('/api/clinic')
      .set('Content-Type', 'application/json')
      .send('{"quebrado":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
