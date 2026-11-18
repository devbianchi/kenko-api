import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../database/transaction';
import { AppError } from '../errors/app-error';
import type {
  BotMessage,
  ConversationRecord,
  ConversationView,
  EffectiveStatus,
} from '../models/conversation.model';
import type { ConversationRepository } from '../repositories/conversation.repository';
import type {
  ReservationRepository,
  ReservaDaConversa,
} from '../repositories/reservation.repository';
import type { RoteiroRepository } from '../repositories/roteiro.repository';
import type { Clock } from '../shared/clock';
import { effectiveStatus } from './conversation-status';
import type { ConversationViewBuilder } from './conversation-view';

/** Estado público da conversa: o que o cliente precisa para reexibir a tela. */
export interface ConversationState {
  record: ConversationRecord;
  status: EffectiveStatus;
  view: ConversationView;
}

export interface CreateResult {
  created: boolean;
  state: ConversationState;
  messages: BotMessage[];
}

type Db = Pool | PoolClient;

/** Regras de conversa: criação idempotente e leitura sem efeitos colaterais. */
export class ConversationService {
  constructor(
    private readonly pool: Pool,
    private readonly conversations: ConversationRepository,
    private readonly roteiro: RoteiroRepository,
    private readonly views: ConversationViewBuilder,
    private readonly reservations: ReservationRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Cria a conversa do contato, com as boas-vindas e o menu. Se o contato já tem conversa, devolve
   * a existente, sem mensagens novas e sem renovar a atividade.
   */
  async create(contactId: string): Promise<CreateResult> {
    const now = this.clock.now();

    return withTransaction(this.pool, async (client) => {
      const existente = await this.conversations.findByContato(contactId, client);
      if (existente) {
        return { created: false, state: await this.state(existente, now, client), messages: [] };
      }

      const idPasso = await this.roteiro.findStepId('menu', client);
      const idCriado = await this.conversations.insertIfAbsent(client, contactId, idPasso, now);

      if (idCriado === null) {
        // Outra requisição criou a conversa entre a leitura e a inserção: devolve a dela.
        const concorrente = await this.conversations.findByContato(contactId, client);
        if (!concorrente) throw new Error('Conversa não encontrada após inserção concorrente.');
        return { created: false, state: await this.state(concorrente, now, client), messages: [] };
      }

      const idMensagem = await this.conversations.insertBotInteraction(client, idCriado, now);
      const texto = await this.roteiro.findStepText('menu', client);
      const record = await this.conversations.findById(idCriado, client);
      if (!record) throw new Error('Conversa criada não encontrada.');

      return {
        created: true,
        state: await this.state(record, now, client),
        messages: [{ id: `msg_${idMensagem}`, author: 'bot', text: texto, sentAt: now }],
      };
    });
  }

  /** Lê uma conversa. Não gera mensagens, não avança o fluxo e não renova a atividade. */
  async get(id: number): Promise<ConversationState> {
    const record = await this.conversations.findById(id);
    if (!record) {
      throw new AppError('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    }
    return this.state(record, this.clock.now());
  }

  /** Estado efetivo de várias conversas. IDs inexistentes são omitidos; a ordem é a da requisição. */
  async list(ids: number[]): Promise<{ record: ConversationRecord; status: EffectiveStatus }[]> {
    const now = this.clock.now();
    const encontradas = await this.conversations.findManyByIds(ids);
    const porId = new Map(encontradas.map((record) => [record.id, record]));
    return ids.flatMap((id) => {
      const record = porId.get(id);
      return record ? [{ record, status: effectiveStatus(record, now) }] : [];
    });
  }

  /** Reservas da conversa, com status e permissão de cancelamento. Não renova a atividade. */
  async listAppointments(
    id: number,
  ): Promise<{ reserva: ReservaDaConversa; status: EffectiveStatus }[]> {
    const record = await this.conversations.findById(id);
    if (!record) {
      throw new AppError('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    }
    const now = this.clock.now();
    const status = effectiveStatus(record, now);
    const reservas = await this.reservations.findByConversation(id, this.pool);
    return reservas.map((reserva) => ({ reserva, status }));
  }

  async state(record: ConversationRecord, now: Date, db?: Db): Promise<ConversationState> {
    return {
      record,
      status: effectiveStatus(record, now),
      view: await this.views.build(
        record.step,
        {
          conversationId: record.id,
          attemptId: record.attemptId,
          agora: now,
          ativa: effectiveStatus(record, now) === 'active',
        },
        db,
      ),
    };
  }
}
