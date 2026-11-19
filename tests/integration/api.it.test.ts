import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { fixedClock } from '../../src/shared/clock';
import { clinicaBasica, resetClinica } from '../support/cenarios';
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

  beforeEach(async () => {
    await resetClinica(pool);
  });

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

  it('GET /api/clinic devolve a clínica completa no envelope', async () => {
    await clinicaBasica(pool);

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
    });
  });

  it('libera a origem do frontend e expõe o X-Request-Id para leitura pelo navegador', async () => {
    const response = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-expose-headers']).toBe('X-Request-Id');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('não libera uma origem fora da lista', async () => {
    const response = await request(app).get('/health').set('Origin', 'http://localhost:9999');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('GET /api/clinic não exige autenticação (VAL-25)', async () => {
    await clinicaBasica(pool);
    const res = await request(app).get('/api/clinic');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
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
