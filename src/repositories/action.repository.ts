import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

export interface ProcessedAction {
  hash: string;
  resultado: unknown;
}

/** Ações já processadas, para devolver o mesmo resultado quando a ação for reenviada (ADR-0006). */
export class ActionRepository {
  async find(idConversa: number, actionId: string, db: Db): Promise<ProcessedAction | null> {
    const { rows } = await db.query<{ hash_entrada: string; resultado: unknown }>(
      `SELECT hash_entrada, resultado FROM acao_processada
        WHERE id_conversa = $1 AND action_id = $2`,
      [idConversa, actionId],
    );
    const row = rows[0];
    return row ? { hash: row.hash_entrada, resultado: row.resultado } : null;
  }

  async insert(
    idConversa: number,
    actionId: string,
    hash: string,
    resultado: unknown,
    instante: Date,
    db: Db,
  ): Promise<void> {
    await db.query(
      `INSERT INTO acao_processada (id_conversa, action_id, hash_entrada, resultado, criada_em)
       VALUES ($1, $2, $3, $4, $5)`,
      [idConversa, actionId, hash, JSON.stringify(resultado), instante],
    );
  }

  /** Registra a ação do paciente, que também renova a atividade da conversa. */
  async insertPatientInteraction(idConversa: number, instante: Date, db: Db): Promise<void> {
    await db.query(
      `INSERT INTO interacao (id_conversa, autor, instante) VALUES ($1, 'paciente', $2)`,
      [idConversa, instante],
    );
  }
}
