import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';
import { createPool } from '../config/database';
import { loadEnv } from '../config/env';

export const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/database/migrations');

const MIGRATION_FILE = /^V(\d+)__.+\.sql$/;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Lê os arquivos V<n>__*.sql em ordem numérica (V10 vem depois de V9). */
export async function loadMigrations(dir: string = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((file) => MIGRATION_FILE.test(file));

  const migrations = await Promise.all(
    files.map(async (name) => {
      const match = MIGRATION_FILE.exec(name);
      const version = Number(match?.[1]);
      const sql = await readFile(path.join(dir, name), 'utf8');
      return { version, name, sql };
    }),
  );

  migrations.sort((a, b) => a.version - b.version);

  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i]?.version === migrations[i - 1]?.version) {
      throw new Error(`Versão de migration duplicada: V${migrations[i]?.version}`);
    }
  }

  return migrations;
}

/** Aplica as migrations pendentes, cada uma em transação, e registra em schema_migrations. Devolve os nomes aplicados. */
export async function migrate(pool: Pool, migrations: Migration[]): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INT PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ version: number }>(
      'SELECT version FROM schema_migrations',
    );
    const done = new Set(rows.map((row) => row.version));

    for (const migration of migrations) {
      if (done.has(migration.version)) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
          migration.version,
          migration.name,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falha ao aplicar ${migration.name}: ${(err as Error).message}`, {
          cause: err,
        });
      }
      applied.push(migration.name);
    }
  } finally {
    client.release();
  }

  return applied;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    const applied = await migrate(pool, await loadMigrations());
    if (applied.length === 0) {
      console.log('Nenhuma migration pendente.');
    } else {
      console.log(`Migrations aplicadas: ${applied.join(', ')}`);
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
