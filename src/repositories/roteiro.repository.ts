import type { Pool, PoolClient } from 'pg';
import type { ViewOption } from '../models/conversation.model';

type Queryable = Pool | PoolClient;

/** Lê o roteiro fixo: passos e opções (ADR-0009). Não guarda nada de conversa. */
export class RoteiroRepository {
  constructor(private readonly pool: Pool) {}

  async findStepId(codigoPasso: string, db: Queryable = this.pool): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      'SELECT id_passo AS id FROM passo_roteiro WHERE codigo_passo = $1',
      [codigoPasso],
    );
    const row = rows[0];
    if (!row) throw new Error(`Passo de roteiro inexistente: ${codigoPasso}`);
    return row.id;
  }

  async findStepCode(idPasso: number, db: Queryable = this.pool): Promise<string> {
    const { rows } = await db.query<{ codigo: string }>(
      'SELECT codigo_passo AS codigo FROM passo_roteiro WHERE id_passo = $1',
      [idPasso],
    );
    const row = rows[0];
    if (!row) throw new Error(`Passo de roteiro inexistente: ${idPasso}`);
    return row.codigo;
  }

  async findStepText(codigoPasso: string, db: Queryable = this.pool): Promise<string> {
    const { rows } = await db.query<{ texto: string }>(
      'SELECT texto FROM passo_roteiro WHERE codigo_passo = $1',
      [codigoPasso],
    );
    const row = rows[0];
    if (!row) throw new Error(`Passo de roteiro inexistente: ${codigoPasso}`);
    return row.texto;
  }

  async findOptions(codigoPasso: string, db: Queryable = this.pool): Promise<ViewOption[]> {
    const { rows } = await db.query<{ codigo_opcao: string; rotulo: string }>(
      `SELECT o.codigo_opcao, o.rotulo
         FROM opcao_roteiro o
         JOIN passo_roteiro p ON p.id_passo = o.id_passo
        WHERE p.codigo_passo = $1
        ORDER BY o.id_opcao`,
      [codigoPasso],
    );
    return rows.map((row) => ({ id: row.codigo_opcao, label: row.rotulo }));
  }
}
