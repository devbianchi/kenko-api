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
  id_paciente: number | null;
}

const SELECT_CONVERSA = `
  SELECT c.id_conversa, p.codigo_passo AS step, c.revisao, c.inicio, c.ultima_interacao,
         c.encerrada_em, c.id_tentativa_atual, c.id_paciente
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
    patientId: row.id_paciente,
  };
}

/** Única camada que fala com as tabelas de conversa. SQL parametrizado, sem ORM (ADR-0002). */
export class ConversationRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Trava a linha da conversa até o fim da transação, para que ações concorrentes sejam
   * serializadas. Só trava a linha de conversa: com join, o PostgreSQL pode devolver vazio depois
   * de esperar o lock. Devolve false quando a conversa não existe.
   */
  async lock(id: number, db: Queryable): Promise<boolean> {
    const { rows } = await db.query<{ id: number }>(
      'SELECT id_conversa AS id FROM conversa WHERE id_conversa = $1 FOR UPDATE',
      [id],
    );
    return rows.length === 1;
  }

  /**
   * Aplica uma ação aceita: incrementa a revisão somente se ela ainda for a esperada (ADR-0006).
   * Devolve false quando a revisão mudou.
   */
  async updateAfterAction(
    db: Queryable,
    atualizacao: {
      id: number;
      expectedRevision: number;
      instante: Date;
      idPasso: number;
      idTentativaAtual: number | null;
      /** Quando true, a conversa deixa de apontar para uma tentativa (depois da confirmação). */
      limparTentativa?: boolean;
      /** Paciente identificado na ação, quando houver. */
      idPaciente?: number | null;
      encerradaEm: Date | null;
      encerramentoMotivo: string | null;
      encerramentoEtapa: string | null;
    },
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE conversa
          SET revisao = revisao + 1,
              ultima_interacao = $3,
              id_passo_atual = $4,
              id_tentativa_atual = CASE WHEN $9::boolean THEN NULL
                                        ELSE COALESCE($5, id_tentativa_atual) END,
              id_paciente = COALESCE($10, id_paciente),
              encerrada_em = COALESCE($6, encerrada_em),
              encerramento_motivo = COALESCE($7, encerramento_motivo),
              encerramento_etapa = COALESCE($8, encerramento_etapa)
        WHERE id_conversa = $1 AND revisao = $2`,
      [
        atualizacao.id,
        atualizacao.expectedRevision,
        atualizacao.instante,
        atualizacao.idPasso,
        atualizacao.idTentativaAtual,
        atualizacao.encerradaEm,
        atualizacao.encerramentoMotivo,
        atualizacao.encerramentoEtapa,
        atualizacao.limparTentativa ?? false,
        atualizacao.idPaciente ?? null,
      ],
    );
    return rowCount === 1;
  }

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

  /**
   * Saudação original da conversa, enquanto o paciente ainda não agiu. Serve ao reenvio da criação
   * depois de uma falha de rede: o cliente recebe a mesma mensagem, com o mesmo id, e deduplica.
   * Depois da primeira ação do paciente, devolve null.
   */
  async findGreetingBeforePatient(
    db: Queryable,
    idConversa: number,
  ): Promise<{ id: number; instante: Date } | null> {
    const { rows } = await db.query<{ id: number; instante: Date }>(
      `SELECT i.id_interacao AS id, i.instante
         FROM interacao i
        WHERE i.id_conversa = $1 AND i.autor = 'bot'
          AND NOT EXISTS (
            SELECT 1 FROM interacao p WHERE p.id_conversa = $1 AND p.autor = 'paciente'
          )
        ORDER BY i.instante, i.id_interacao
        LIMIT 1`,
      [idConversa],
    );
    return rows[0] ?? null;
  }
}
