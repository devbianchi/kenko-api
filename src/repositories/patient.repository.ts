import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

/** Paciente exclusivo de uma conversa (RN-06). Não há busca global por nome. */
export class PatientRepository {
  async insert(nome: string, nascimento: string, db: Db): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO paciente (nome, data_nascimento) VALUES ($1, $2) RETURNING id_paciente AS id`,
      [nome, nascimento],
    );
    return rows[0]!.id;
  }
}
