import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

/** Tentativas de agendamento: cada escolha de horário de uma conversa, do início ao resultado. */
export class AttemptRepository {
  async nextNumber(idConversa: number, db: Db): Promise<number> {
    const { rows } = await db.query<{ n: number }>(
      'SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM tentativa WHERE id_conversa = $1',
      [idConversa],
    );
    return rows[0]!.n;
  }

  async insert(idConversa: number, numero: number, instante: Date, db: Db): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO tentativa (id_conversa, numero, iniciada_em)
       VALUES ($1, $2, $3) RETURNING id_tentativa AS id`,
      [idConversa, numero, instante],
    );
    return rows[0]!.id;
  }

  async findSpecialty(idTentativa: number, db: Db): Promise<number | null> {
    const { rows } = await db.query<{ id: number | null }>(
      'SELECT id_especialidade AS id FROM tentativa WHERE id_tentativa = $1',
      [idTentativa],
    );
    return rows[0]?.id ?? null;
  }

  async setSelectedSlot(idTentativa: number, idHorario: number | null, db: Db): Promise<void> {
    await db.query('UPDATE tentativa SET id_horario_selecionado = $2 WHERE id_tentativa = $1', [
      idTentativa,
      idHorario,
    ]);
  }

  async findSelectedSlot(idTentativa: number, db: Db): Promise<number | null> {
    const { rows } = await db.query<{ id: number | null }>(
      'SELECT id_horario_selecionado AS id FROM tentativa WHERE id_tentativa = $1',
      [idTentativa],
    );
    return rows[0]?.id ?? null;
  }

  /** Fecha a tentativa com a reserva confirmada. */
  async finishConfirmed(idTentativa: number, instante: Date, db: Db): Promise<void> {
    await db.query(
      `UPDATE tentativa SET resultado = 'confirmed', finalizada_em = $2
        WHERE id_tentativa = $1 AND finalizada_em IS NULL`,
      [idTentativa, instante],
    );
  }

  async setSpecialty(idTentativa: number, idEspecialidade: number, db: Db): Promise<void> {
    await db.query('UPDATE tentativa SET id_especialidade = $2 WHERE id_tentativa = $1', [
      idTentativa,
      idEspecialidade,
    ]);
  }

  async setVisitKind(idTentativa: number, tipoVisita: string, db: Db): Promise<void> {
    await db.query('UPDATE tentativa SET tipo_visita = $2 WHERE id_tentativa = $1', [
      idTentativa,
      tipoVisita,
    ]);
  }

  async finish(idTentativa: number, resultado: string, instante: Date, db: Db): Promise<void> {
    await db.query(
      `UPDATE tentativa SET resultado = $2, finalizada_em = $3
        WHERE id_tentativa = $1 AND finalizada_em IS NULL`,
      [idTentativa, resultado, instante],
    );
  }
}
