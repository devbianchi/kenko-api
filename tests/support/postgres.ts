import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { createPool } from '../../src/config/database';

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  pool: Pool;
}

/** Sobe um PostgreSQL 16 real, descartável, para cada suíte de integração (ADR-0003). */
export async function startPostgres(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:16').start();
  const pool = createPool(container.getConnectionUri());
  return { container, pool };
}
