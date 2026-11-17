import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { loadMigrations, migrate } from '../../src/database/migrate';
import { startPostgres } from '../support/postgres';

describe('migrations e restrições do banco', () => {
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

  let contadorConversas = 0;

  async function cenarioBase() {
    const clinica = await pool.query<{ id: number }>(
      `INSERT INTO clinica (nome, endereco, telefone)
       VALUES ('Clínica Teste', 'Rua Teste, 1', '1100000000') RETURNING id_clinica AS id`,
    );
    const idClinica = clinica.rows[0]!.id;

    const especialidade = await pool.query<{ id: number }>(
      `INSERT INTO especialidade (id_clinica, nome_especialidade)
       VALUES ($1, 'Dermatologia') RETURNING id_especialidade AS id`,
      [idClinica],
    );
    const medico = await pool.query<{ id: number }>(
      `INSERT INTO medico (id_especialidade, nome_medico)
       VALUES ($1, 'Dra. Helena') RETURNING id_medico AS id`,
      [especialidade.rows[0]!.id],
    );
    const sala = await pool.query<{ id: number }>(
      `INSERT INTO sala (id_clinica, nome) VALUES ($1, 'Sala 1') RETURNING id_sala AS id`,
      [idClinica],
    );
    const horario = await pool.query<{ id: number }>(
      `INSERT INTO horario (id_medico, id_sala, inicio, fim)
       VALUES ($1, $2, '2026-11-11T12:00:00Z', '2026-11-11T12:30:00Z') RETURNING id_horario AS id`,
      [medico.rows[0]!.id, sala.rows[0]!.id],
    );
    const menu = await pool.query<{ id: number }>(
      `SELECT id_passo AS id FROM passo_roteiro WHERE codigo_passo = 'menu'`,
    );
    const conversa = await pool.query<{ id: number }>(
      `INSERT INTO conversa (id_passo_atual, contato, inicio, ultima_interacao)
       VALUES ($1, $2, '2026-11-10T15:00:00Z', '2026-11-10T15:00:00Z')
       RETURNING id_conversa AS id`,
      [menu.rows[0]!.id, `contato_${++contadorConversas}`],
    );
    const paciente = await pool.query<{ id: number }>(
      `INSERT INTO paciente (nome, data_nascimento)
       VALUES ('Ana Silva', '1998-04-15') RETURNING id_paciente AS id`,
    );

    return {
      idHorario: horario.rows[0]!.id,
      idConversa: conversa.rows[0]!.id,
      idPaciente: paciente.rows[0]!.id,
    };
  }

  describe('roteiro do bot', () => {
    it('cria os dez passos do roteiro, identificados pelo código técnico', async () => {
      const { rows } = await pool.query<{ codigo_passo: string }>(
        'SELECT codigo_passo FROM passo_roteiro ORDER BY codigo_passo',
      );
      expect(rows.map((r) => r.codigo_passo)).toEqual([
        'appointments',
        'clinic_information',
        'closed',
        'confirmation',
        'continue_after_no_slots',
        'menu',
        'patient_data',
        'slot_selection',
        'specialty',
        'visit_kind',
      ]);
    });

    it('registra as três opções do menu com as ações esperadas', async () => {
      const { rows } = await pool.query<{ codigo_opcao: string; acao: string }>(
        `SELECT o.codigo_opcao, o.acao
           FROM opcao_roteiro o
           JOIN passo_roteiro p ON p.id_passo = o.id_passo
          WHERE p.codigo_passo = 'menu'
          ORDER BY o.codigo_opcao`,
      );
      expect(rows).toEqual([
        { codigo_opcao: 'opt_appointments', acao: 'appointments' },
        { codigo_opcao: 'opt_clinic_info', acao: 'clinic_info' },
        { codigo_opcao: 'opt_schedule', acao: 'schedule' },
      ]);
    });

    it('não deixa nenhuma opção sem passo de destino', async () => {
      const { rows } = await pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM opcao_roteiro WHERE id_passo_destino IS NULL',
      );
      expect(rows[0]?.n).toBe(0);
    });

    it('rejeita duas opções com o mesmo código no mesmo passo', async () => {
      await expect(
        pool.query(
          `INSERT INTO opcao_roteiro (id_passo, id_passo_destino, codigo_opcao, rotulo, acao)
           SELECT id_passo, id_passo, 'opt_schedule', 'Duplicada', 'schedule'
             FROM passo_roteiro WHERE codigo_passo = 'menu'`,
        ),
      ).rejects.toThrow(/uq_opcao_roteiro_passo_codigo/);
    });

    it('rejeita uma etapa fora da lista permitida', async () => {
      await expect(
        pool.query(
          `INSERT INTO passo_roteiro (codigo_passo, etapa, texto)
           VALUES ('invalido', 'etapa_inexistente', 'Texto')`,
        ),
      ).rejects.toThrow(/check/i);
    });
  });

  describe('reserva (ADR-0007)', () => {
    it('permite uma reserva ativa por horário', async () => {
      const { idHorario, idPaciente, idConversa } = await cenarioBase();
      await pool.query(
        `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em)
         VALUES ($1, $2, $3, '2026-11-10T15:05:00Z')`,
        [idHorario, idPaciente, idConversa],
      );

      await expect(
        pool.query(
          `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em)
           VALUES ($1, $2, $3, '2026-11-10T15:06:00Z')`,
          [idHorario, idPaciente, idConversa],
        ),
      ).rejects.toThrow(/uq_reserva_horario_ativa/);
    });

    it('permite nova reserva no mesmo horário depois de cancelar a anterior', async () => {
      const { idHorario, idPaciente, idConversa } = await cenarioBase();
      await pool.query(
        `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em, cancelada_em)
         VALUES ($1, $2, $3, '2026-11-10T15:05:00Z', '2026-11-10T15:10:00Z')`,
        [idHorario, idPaciente, idConversa],
      );

      await expect(
        pool.query(
          `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em)
           VALUES ($1, $2, $3, '2026-11-10T15:11:00Z')`,
          [idHorario, idPaciente, idConversa],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('idempotência e encerramento', () => {
    it('rejeita duas ações com o mesmo actionId na mesma conversa', async () => {
      const { idConversa } = await cenarioBase();
      const insert = `INSERT INTO acao_processada (id_conversa, action_id, hash_entrada, resultado, criada_em)
                      VALUES ($1, 'act_1', $2, '{}', '2026-11-10T15:00:00Z')`;
      const hash = 'a'.repeat(64);
      await pool.query(insert, [idConversa, hash]);
      await expect(pool.query(insert, [idConversa, hash])).rejects.toThrow(
        /acao_processada_id_conversa_action_id_key/,
      );
    });

    it('exige o motivo de encerramento quando a conversa está encerrada', async () => {
      const { idConversa } = await cenarioBase();
      await expect(
        pool.query(
          `UPDATE conversa SET encerrada_em = '2026-11-10T15:20:00Z' WHERE id_conversa = $1`,
          [idConversa],
        ),
      ).rejects.toThrow(/check/i);
    });
  });
});
