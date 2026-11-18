import type { Pool } from 'pg';
import { createPool } from '../config/database';
import { loadEnv } from '../config/env';
import { SEED_SCRIPTS, type SeedScript } from './seeds';

export const DEMO_CLINIC_NAME = 'Clínica Demonstração';

export interface SeedOptions {
  /** Instante de referência fixo, para testes. Sem valor, usa 12h de Brasília no dia da carga. */
  referencia?: string;
  /** Ambiente de execução. Por padrão, o NODE_ENV do processo. */
  nodeEnv?: string;
}

/** Recusa a carga fora da base de demonstração (ADR-0011). */
async function assertDemonstrationDatabase(pool: Pool, nodeEnv: string): Promise<void> {
  if (nodeEnv === 'production') {
    throw new Error('A carga de demonstração não roda com NODE_ENV=production.');
  }
  const { rows } = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM clinica WHERE nome <> $1',
    [DEMO_CLINIC_NAME],
  );
  if ((rows[0]?.n ?? 0) > 0) {
    throw new Error(
      'Banco não é de demonstração: há clínica com outro nome. A carga foi cancelada sem alterar nada.',
    );
  }
}

/**
 * Carrega a demonstração em uma única transação. Os scripts removem a demonstração anterior e
 * recriam tudo, então rodar de novo produz os mesmos fatos. Devolve os nomes dos scripts aplicados.
 */
export async function runSeed(pool: Pool, options: SeedOptions = {}): Promise<string[]> {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  await assertDemonstrationDatabase(pool, nodeEnv);

  const scripts: readonly SeedScript[] = SEED_SCRIPTS;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (options.referencia) {
      await client.query("SELECT set_config('kenko.referencia', $1, true)", [options.referencia]);
    } else {
      await client.query(
        `SELECT set_config('kenko.referencia',
           ((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '12 hours')
             AT TIME ZONE 'America/Sao_Paulo')::text, true)`,
      );
    }

    const applied: string[] = [];
    for (const script of scripts) {
      try {
        await client.query(script.sql);
      } catch (err) {
        throw new Error(`Falha ao carregar ${script.name}: ${(err as Error).message}`, {
          cause: err,
        });
      }
      applied.push(script.name);
    }

    await client.query('COMMIT');
    return applied;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    const applied = await runSeed(pool, { nodeEnv: env.NODE_ENV });
    console.log(`Demonstração carregada: ${applied.join(', ')}`);
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
