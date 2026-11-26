import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../../src/app';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { runSeed } from '../../src/database/seed';
import { fixedClock } from '../../src/shared/clock';
import { startPostgres } from '../support/postgres';
import { runRequestsFile } from '../support/requests-http';
import { assertOpenApiResponse, assertSchema, openapi } from '../support/openapi';

const NOW = '2026-11-10T15:00:00Z'; // 12:00 em Brasília: a demonstração é relativa a este dia.

describe('requests.http da entrega', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
    await runSeed(pool, { referencia: NOW, nodeEnv: 'test' });
  }, 300_000);

  afterAll(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  it('executa o fluxo completo do bot, o painel e os erros esperados, na ordem do arquivo', async () => {
    const app = buildApp({ pool, clock: fixedClock(NOW), corsOrigins: [] });
    const executed = await runRequestsFile(app, 'requests.http', fixedClock(NOW), (response) => {
      // O cenário de rota inexistente usa o envelope geral, sem inventar uma operação no contrato.
      if (response.method === 'GET' && response.url === '/api/inexistente') {
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
        assertSchema(openapi.components.schemas.ErrorResponse!, response.body, 'rota inexistente');
        expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
        return;
      }
      assertOpenApiResponse(
        response.method,
        response.url,
        response.status,
        response.body,
        response.headers,
      );
    });

    expect(executed.length).toBeGreaterThanOrEqual(25);
    const cancelamento = executed.find((item) => item.title.startsWith('12.'));
    expect(cancelamento?.status).toBe(200);
    const home = executed.find((item) => item.title.startsWith('19.'));
    expect((home?.body as { data: { clinic: { name: string } } }).data.clinic.name).toBe(
      'Clínica Demonstração',
    );
  }, 120_000);

  it('recarregar a demonstração depois do fluxo do bot termina e volta aos 110 fatos da carga', async () => {
    const app = buildApp({ pool, clock: fixedClock(NOW), corsOrigins: [] });
    await runRequestsFile(app, 'requests.http', fixedClock(NOW));

    await runSeed(pool, { referencia: NOW, nodeEnv: 'test' });

    const { rows } = await pool.query<{ conversas: number; reservas_orfas: number }>(
      `SELECT (SELECT count(*) FROM conversa)::int AS conversas,
              (SELECT count(*) FROM reserva r LEFT JOIN conversa c ON c.id_conversa = r.id_conversa_origem
                WHERE c.id_conversa IS NULL)::int AS reservas_orfas`,
    );
    expect(rows[0]).toEqual({ conversas: 110, reservas_orfas: 0 });
  }, 180_000);
});
