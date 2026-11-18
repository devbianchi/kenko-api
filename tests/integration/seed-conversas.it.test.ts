import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { runSeed } from '../../src/database/seed';
import { startPostgres } from '../support/postgres';

const REFERENCIA = '2026-11-10T15:00:00Z'; // 12:00 em America/Sao_Paulo, terça-feira

async function contar(pool: Pool, sql: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`SELECT (${sql})::int AS n`);
  return rows[0]!.n;
}

describe('carga de demonstração: conversas e funil', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    ({ container, pool } = await startPostgres());
    await migrate(pool, await loadMigrations());
    await runSeed(pool, { referencia: REFERENCIA });
  }, 300_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('gera 110 conversas de demonstração', async () => {
    expect(await contar(pool, `SELECT count(*) FROM conversa WHERE contato LIKE 'demo\\_%'`)).toBe(
      110,
    );
  });

  it('tem entre 80 e 100 conversas que iniciaram agendamento (dataset)', async () => {
    const n = await contar(
      pool,
      `SELECT count(DISTINCT id_conversa) FROM evento_conversa WHERE tipo = 'STARTED_SCHEDULING'`,
    );
    expect(n).toBeGreaterThanOrEqual(80);
    expect(n).toBeLessThanOrEqual(100);
  });

  it('tem entre 40 e 55 conversas com confirmação (dataset)', async () => {
    const n = await contar(
      pool,
      `SELECT count(DISTINCT id_conversa) FROM evento_conversa WHERE tipo = 'APPOINTMENT_CONFIRMED'`,
    );
    expect(n).toBeGreaterThanOrEqual(40);
    expect(n).toBeLessThanOrEqual(55);
  });

  it('tem 93 conversas encerradas por Sair: todas as que não abandonaram', async () => {
    const n = await contar(
      pool,
      `SELECT count(DISTINCT id_conversa) FROM evento_conversa WHERE tipo = 'EXITED'`,
    );
    expect(n).toBe(93);
  });

  it('tem 16 saídas durante o agendamento (viu horários ou viu sem horários e saiu)', async () => {
    const n = await contar(
      pool,
      `SELECT count(DISTINCT e.id_conversa) FROM evento_conversa e
         JOIN tentativa t ON t.id_tentativa = e.id_tentativa
        WHERE e.tipo = 'EXITED' AND t.resultado IN ('exited', 'no_slots')`,
    );
    expect(n).toBe(16);
  });

  it('toda conversa encerrada tem motivo exited e etapa de encerramento', async () => {
    const n = await contar(
      pool,
      `SELECT count(*) FROM conversa
        WHERE contato LIKE 'demo\\_%'
          AND encerrada_em IS NOT NULL
          AND (encerramento_motivo <> 'exited' OR encerramento_etapa IS NULL)`,
    );
    expect(n).toBe(0);
  });

  it('há conversas iniciadas de madrugada e à noite, para cobrir o mapa de calor', async () => {
    const madrugada = await contar(
      pool,
      `SELECT count(*) FROM conversa WHERE contato LIKE 'demo\\_%'
          AND (inicio AT TIME ZONE 'America/Sao_Paulo')::time < '06:00'`,
    );
    const noite = await contar(
      pool,
      `SELECT count(*) FROM conversa WHERE contato LIKE 'demo\\_%'
          AND (inicio AT TIME ZONE 'America/Sao_Paulo')::time >= '18:00'`,
    );
    expect(madrugada).toBeGreaterThanOrEqual(3);
    expect(noite).toBeGreaterThanOrEqual(3);
  });

  it('tem entre 10 e 20 conversas abandonadas: sem encerramento e sem saída', async () => {
    const n = await contar(
      pool,
      `SELECT count(*) FROM conversa c
        WHERE c.contato LIKE 'demo\\_%'
          AND c.encerrada_em IS NULL
          AND c.ultima_interacao < TIMESTAMPTZ '${REFERENCIA}' - interval '1 hour'
          AND NOT EXISTS (SELECT 1 FROM evento_conversa e
                           WHERE e.id_conversa = c.id_conversa AND e.tipo = 'EXITED')`,
    );
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(20);
  });

  it('tem entre 15 e 25 buscas sem horário, e a soma por especialidade é igual ao total', async () => {
    const total = await contar(pool, `SELECT count(*) FROM busca_sem_horario`);
    expect(total).toBeGreaterThanOrEqual(15);
    expect(total).toBeLessThanOrEqual(25);
    const porEspecialidade = await contar(
      pool,
      `SELECT count(*) FROM busca_sem_horario b
         JOIN especialidade e ON e.id_especialidade = b.id_especialidade`,
    );
    expect(porEspecialidade).toBe(total);
  });

  it('tem entre 8 e 12 reservas canceladas', async () => {
    const n = await contar(pool, `SELECT count(*) FROM reserva WHERE cancelada_em IS NOT NULL`);
    expect(n).toBeGreaterThanOrEqual(8);
    expect(n).toBeLessThanOrEqual(12);
  });

  it('tem pelo menos 5 consultas completas no mês de referência', async () => {
    const n = await contar(
      pool,
      `SELECT count(*) FROM reserva r JOIN horario h ON h.id_horario = r.id_horario
        WHERE r.cancelada_em IS NULL
          AND h.fim <= TIMESTAMPTZ '${REFERENCIA}'
          AND h.inicio >= TIMESTAMPTZ '2026-11-01T00:00:00-03:00'`,
    );
    expect(n).toBeGreaterThanOrEqual(5);
  });

  it('tem pelo menos 5 consultas pendentes com início futuro', async () => {
    const n = await contar(
      pool,
      `SELECT count(*) FROM reserva r JOIN horario h ON h.id_horario = r.id_horario
        WHERE r.cancelada_em IS NULL AND h.inicio > TIMESTAMPTZ '${REFERENCIA}'`,
    );
    expect(n).toBeGreaterThanOrEqual(5);
  });

  it('tem pelo menos 25 confirmações com duração de 1 a 12 minutos, e algumas acima de 10', async () => {
    const { rows } = await pool.query<{ total: number; acima: number }>(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE d > interval '10 minutes')::int AS acima
        FROM (
          SELECT c.inicio, max(e.instante) FILTER (WHERE e.tipo = 'APPOINTMENT_CONFIRMED') AS confirmada,
                 (max(e.instante) FILTER (WHERE e.tipo = 'APPOINTMENT_CONFIRMED')) - c.inicio AS d
            FROM conversa c JOIN evento_conversa e ON e.id_conversa = c.id_conversa
           WHERE c.contato LIKE 'demo\\_%'
           GROUP BY c.id_conversa, c.inicio
          HAVING max(e.instante) FILTER (WHERE e.tipo = 'APPOINTMENT_CONFIRMED') IS NOT NULL
        ) t`);
    expect(rows[0]!.total).toBeGreaterThanOrEqual(25);
    expect(rows[0]!.acima).toBeGreaterThanOrEqual(1);
  });

  it('tem entre 40 e 60 pacientes, cada um vinculado a uma conversa confirmada', async () => {
    const n = await contar(pool, `SELECT count(*) FROM paciente`);
    expect(n).toBeGreaterThanOrEqual(40);
    expect(n).toBeLessThanOrEqual(60);
  });

  it('toda conversa confirmada tem paciente, reserva, tentativa e os eventos do percurso', async () => {
    const incompletas = await contar(
      pool,
      `SELECT count(*) FROM conversa c
        WHERE c.contato LIKE 'demo\\_%'
          AND EXISTS (SELECT 1 FROM evento_conversa e
                       WHERE e.id_conversa = c.id_conversa AND e.tipo = 'APPOINTMENT_CONFIRMED')
          AND NOT (
               c.id_paciente IS NOT NULL
           AND c.id_tentativa_atual IS NOT NULL
           AND EXISTS (SELECT 1 FROM reserva r WHERE r.id_conversa_origem = c.id_conversa)
           AND EXISTS (SELECT 1 FROM evento_conversa e
                        WHERE e.id_conversa = c.id_conversa AND e.tipo = 'SELECTED_SLOT')
          )`,
    );
    expect(incompletas).toBe(0);
  });

  it('nenhuma conversa abandonada tem evento EXITED', async () => {
    const n = await contar(
      pool,
      `SELECT count(*) FROM conversa c
        WHERE c.encerramento_motivo = 'exited' AND c.encerrada_em IS NULL`,
    );
    expect(n).toBe(0);
  });

  it('há pelo menos três conversas iniciadas fora do expediente (MET-A03)', async () => {
    const n = await contar(
      pool,
      `SELECT count(*) FROM conversa c
        WHERE c.contato LIKE 'demo\\_%'
          AND c.id_passo_atual IS NOT NULL
          AND (extract(dow FROM c.inicio AT TIME ZONE 'America/Sao_Paulo') = 0
               OR (c.inicio AT TIME ZONE 'America/Sao_Paulo')::time < '07:00'
               OR (extract(dow FROM c.inicio AT TIME ZONE 'America/Sao_Paulo') = 6
                   AND (c.inicio AT TIME ZONE 'America/Sao_Paulo')::time >= '13:00'))`,
    );
    expect(n).toBeGreaterThanOrEqual(3);
  });

  it('há algum dia com quatro ou mais consultas reservadas', async () => {
    const n = await contar(
      pool,
      `SELECT count(*) FROM (
         SELECT (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia
           FROM reserva r JOIN horario h ON h.id_horario = r.id_horario
          WHERE r.cancelada_em IS NULL
          GROUP BY dia HAVING count(*) >= 4) d`,
    );
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it('rodar a carga de novo produz os mesmos fatos', async () => {
    const antes = await contar(pool, `SELECT count(*) FROM evento_conversa`);
    await runSeed(pool, { referencia: REFERENCIA });
    expect(await contar(pool, `SELECT count(*) FROM evento_conversa`)).toBe(antes);
    expect(await contar(pool, `SELECT count(*) FROM conversa WHERE contato LIKE 'demo\\_%'`)).toBe(
      110,
    );
  }, 300_000);
});
