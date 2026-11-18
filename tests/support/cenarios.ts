import type { Pool } from 'pg';

/**
 * Apaga as conversas e os cadastros da clínica, e reinicia as sequências. Usado antes de cada teste.
 * Não usa TRUNCATE CASCADE em clinica: o cascata passaria por especialidade e apagaria o roteiro
 * (opcao_roteiro referencia especialidade).
 */
export async function resetClinica(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE conversa RESTART IDENTITY CASCADE');
  await pool.query('DELETE FROM horario');
  await pool.query('DELETE FROM medico');
  await pool.query('DELETE FROM sala');
  await pool.query('DELETE FROM especialidade');
  await pool.query('DELETE FROM expediente');
  await pool.query('DELETE FROM clinica');
}

/**
 * Clínica da demonstração: expediente Seg–Sex 07h–18h, Sáb 09h–13h, domingo fechado,
 * e quatro especialidades. Devolve o identificador da clínica.
 */
export async function clinicaBasica(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO clinica (nome, endereco, telefone)
     VALUES ('Clínica Demonstração', 'Rua de Exemplo, 100', '1100000000')
     RETURNING id_clinica AS id`,
  );
  const idClinica = rows[0]!.id;

  for (const dia of [1, 2, 3, 4, 5]) {
    await pool.query(
      `INSERT INTO expediente (id_clinica, dia_semana, abertura, fechamento)
       VALUES ($1, $2, '07:00', '18:00')`,
      [idClinica, dia],
    );
  }
  await pool.query(
    `INSERT INTO expediente (id_clinica, dia_semana, abertura, fechamento)
     VALUES ($1, 6, '09:00', '13:00')`,
    [idClinica],
  );
  await pool.query(
    `INSERT INTO expediente (id_clinica, dia_semana, abertura, fechamento)
     VALUES ($1, 0, NULL, NULL)`,
    [idClinica],
  );

  for (const nome of ['Clínico geral', 'Dermatologia', 'Ortopedia', 'Cardiologia']) {
    await pool.query(`INSERT INTO especialidade (id_clinica, nome_especialidade) VALUES ($1, $2)`, [
      idClinica,
      nome,
    ]);
  }

  return idClinica;
}
