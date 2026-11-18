import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { runSeed } from '../../src/database/seed';
import { startPostgres } from '../support/postgres';

const REFERENCIA = '2026-11-10T15:00:00Z'; // 12:00 em America/Sao_Paulo, terça-feira

interface Contagens {
  clinica: number;
  expediente: number;
  especialidade: number;
  medico: number;
  sala: number;
  horario: number;
}

describe('carga de demonstração: cadastros e horários', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
  }, 180_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  async function contagens(): Promise<Contagens> {
    const { rows } = await pool.query<Contagens>(`
      SELECT (SELECT count(*)::int FROM clinica)       AS clinica,
             (SELECT count(*)::int FROM expediente)    AS expediente,
             (SELECT count(*)::int FROM especialidade) AS especialidade,
             (SELECT count(*)::int FROM medico)        AS medico,
             (SELECT count(*)::int FROM sala)          AS sala,
             (SELECT count(*)::int FROM horario)       AS horario`);
    return rows[0]!;
  }

  it('cria a clínica, 7 expedientes, 4 especialidades, 6 médicos e 6 salas', async () => {
    await runSeed(pool, { referencia: REFERENCIA });
    const c = await contagens();
    expect(c).toMatchObject({
      clinica: 1,
      expediente: 7,
      especialidade: 4,
      medico: 6,
      sala: 6,
    });
    expect(c.horario).toBeGreaterThan(0);
  });

  it('é idempotente: rodar de novo produz os mesmos fatos', async () => {
    const primeira = await contagens();
    await runSeed(pool, { referencia: REFERENCIA });
    expect(await contagens()).toEqual(primeira);
  });

  it('gera horários apenas dentro da janela de 60 dias antes até 14 depois', async () => {
    const { rows } = await pool.query<{ primeiro: string; ultimo: string }>(`
      SELECT min((inicio AT TIME ZONE 'America/Sao_Paulo')::date)::text AS primeiro,
             max((inicio AT TIME ZONE 'America/Sao_Paulo')::date)::text AS ultimo
        FROM horario`);
    // 10/11/2026 menos 60 dias é 11/09/2026; mais 14 dias é 24/11/2026.
    expect(rows[0]).toEqual({ primeiro: '2026-09-11', ultimo: '2026-11-24' });
  });

  it('não gera horários no domingo', async () => {
    const { rows } = await pool.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM horario
       WHERE extract(dow FROM inicio AT TIME ZONE 'America/Sao_Paulo') = 0`);
    expect(rows[0]?.n).toBe(0);
  });

  it('respeita o expediente: seg–sex 07:00–17:30 e sábado 09:00–12:30 de início', async () => {
    const { rows } = await pool.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM horario
       WHERE NOT (
           (extract(dow FROM inicio AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
             AND (inicio AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN '07:00' AND '17:30')
        OR (extract(dow FROM inicio AT TIME ZONE 'America/Sao_Paulo') = 6
             AND (inicio AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN '09:00' AND '12:30'))`);
    expect(rows[0]?.n).toBe(0);
  });

  it('cada horário dura 30 minutos', async () => {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM horario WHERE fim - inicio <> interval '30 minutes'`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('nenhum médico tem dois horários no mesmo instante', async () => {
    const { rows } = await pool.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM (
        SELECT id_medico, inicio FROM horario GROUP BY id_medico, inicio HAVING count(*) > 1
      ) duplicados`);
    expect(rows[0]?.n).toBe(0);
  });

  it('recusa carregar em produção sem alterar a base', async () => {
    const antes = await contagens();
    await expect(runSeed(pool, { referencia: REFERENCIA, nodeEnv: 'production' })).rejects.toThrow(
      /NODE_ENV=production/,
    );
    expect(await contagens()).toEqual(antes);
  });

  it('recusa carregar quando a base tem clínica real, sem alterar nada', async () => {
    await pool.query(
      `INSERT INTO clinica (nome, endereco, telefone) VALUES ('Clínica Real', 'Rua A, 1', '11999999999')`,
    );
    try {
      const antes = await contagens();
      await expect(runSeed(pool, { referencia: REFERENCIA })).rejects.toThrow(
        /não é de demonstração/,
      );
      expect(await contagens()).toEqual(antes);
    } finally {
      await pool.query(`DELETE FROM clinica WHERE nome = 'Clínica Real'`);
    }
  });
});
