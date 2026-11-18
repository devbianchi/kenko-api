import type { Pool, PoolClient } from 'pg';
import type { ConversationRecord } from '../models/conversation.model';

type Queryable = Pool | PoolClient;

interface ConversationRow {
  id_conversa: number;
  step: string;
  revisao: number;
  inicio: Date;
  ultima_interacao: Date;
  encerrada_em: Date | null;
  id_tentativa_atual: number | null;
}

const SELECT_CONVERSA = `
  SELECT c.id_conversa, p.codigo_passo AS step, c.revisao, c.inicio, c.ultima_interacao,
         c.encerrada_em, c.id_tentativa_atual
    FROM conversa c
    JOIN passo_roteiro p ON p.id_passo = c.id_passo_atual`;

function toRecord(row: ConversationRow): ConversationRecord {
  return {
    id: row.id_conversa,
    step: row.step,
    revision: row.revisao,
    startedAt: row.inicio,
    lastInteractionAt: row.ultima_interacao,
    closedAt: row.encerrada_em,
    attemptId: row.id_tentativa_atual,
  };
}

/** Única camada que fala com as tabelas de conversa. SQL parametrizado, sem ORM (ADR-0002). */
export class ConversationRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: number, db: Queryable = this.pool): Promise<ConversationRecord | null> {
    const { rows } = await db.query<ConversationRow>(
      `${SELECT_CONVERSA} WHERE c.id_conversa = $1`,
      [id],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByContato(
    contato: string,
    db: Queryable = this.pool,
  ): Promise<ConversationRecord | null> {
    const { rows } = await db.query<ConversationRow>(`${SELECT_CONVERSA} WHERE c.contato = $1`, [
      contato,
    ]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findManyByIds(ids: number[]): Promise<ConversationRecord[]> {
    const { rows } = await this.pool.query<ConversationRow>(
      `${SELECT_CONVERSA} WHERE c.id_conversa = ANY($1::int[])`,
      [ids],
    );
    return rows.map(toRecord);
  }

  /** Cria a conversa, ou não faz nada se o contato já tem uma. Devolve o id criado ou null. */
  async insertIfAbsent(
    db: Queryable,
    contato: string,
    idPasso: number,
    instante: Date,
  ): Promise<number | null> {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO conversa (id_passo_atual, contato, inicio, ultima_interacao)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (contato) DO NOTHING
       RETURNING id_conversa AS id`,
      [idPasso, contato, instante],
    );
    return rows[0]?.id ?? null;
  }

  /** Registra uma ação do bot na conversa. Devolve o id da interação, usado como id da mensagem. */
  async insertBotInteraction(db: Queryable, idConversa: number, instante: Date): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO interacao (id_conversa, autor, instante)
       VALUES ($1, 'bot', $2)
       RETURNING id_interacao AS id`,
      [idConversa, instante],
    );
    return rows[0]!.id;
  }
}
