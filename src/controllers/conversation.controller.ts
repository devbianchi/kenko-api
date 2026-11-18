import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type { ConversationRecord, EffectiveStatus } from '../models/conversation.model';
import type { ConversationService, ConversationState } from '../services/conversation.service';
import { createConversationSchema, MAX_IDS_PER_LIST } from '../schemas/conversation.schema';
import { envelope } from '../shared/envelope';
import type { Clock } from '../shared/clock';
import { toBusinessIso } from '../shared/business-time';
import { decodeId, encodeId } from '../shared/opaque-id';

function availableActions(status: EffectiveStatus): string[] {
  return status === 'active' ? ['exit'] : [];
}

function conversationBody(record: ConversationRecord, status: EffectiveStatus) {
  return {
    id: encodeId('cv', record.id),
    effectiveStatus: status,
    revision: record.revision,
    step: record.step,
    attemptId: record.attemptId === null ? null : encodeId('attempt', record.attemptId),
  };
}

function parseCreateBody(body: unknown): { contactId: string } {
  const parsed = createConversationSchema.safeParse(body);
  if (parsed.success) return parsed.data;

  const ausente = typeof body !== 'object' || body === null || !('contactId' in body);
  if (ausente) {
    throw new AppError('MISSING_PARAMETER', 'Campo obrigatório ausente.', {
      contactId: 'Obrigatório.',
    });
  }
  throw new AppError('INVALID_INPUT_TYPE', 'contactId inválido.', {
    contactId: 'Texto de 1 a 64 caracteres.',
  });
}

function parseIds(raw: unknown): number[] {
  if (raw === undefined) {
    throw new AppError('MISSING_PARAMETER', 'Parâmetro obrigatório ausente.', {
      ids: 'Obrigatório.',
    });
  }
  if (typeof raw !== 'string') {
    throw new AppError('INVALID_IDS', 'Parâmetro ids inválido.', { ids: 'Formato inválido.' });
  }

  const partes = raw.split(',').map((parte) => parte.trim());
  if (partes.length > MAX_IDS_PER_LIST) {
    throw new AppError('INVALID_IDS', 'Parâmetro ids inválido.', {
      ids: `No máximo ${MAX_IDS_PER_LIST} IDs por chamada.`,
    });
  }

  const ids = partes.map((parte) => decodeId('cv', parte));
  if (ids.some((id) => id === null)) {
    throw new AppError('INVALID_IDS', 'Parâmetro ids inválido.', { ids: 'Formato inválido.' });
  }
  return [...new Set(ids as number[])];
}

/** Adapta HTTP ao serviço: valida a entrada, chama o serviço e responde no formato do contrato. */
export class ConversationController {
  constructor(
    private readonly service: ConversationService,
    private readonly clock: Clock,
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const { contactId } = parseCreateBody(req.body);
    const result = await this.service.create(contactId);
    const status = result.state.status;

    res.status(result.created ? 201 : 200).json({
      conversation: conversationBody(result.state.record, status),
      messages: result.messages.map((message) => ({
        id: message.id,
        author: message.author,
        text: message.text,
        sentAt: toBusinessIso(message.sentAt),
      })),
      view: result.state.view,
      availableActions: availableActions(status),
    });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const id = decodeId('cv', String(req.params.id));
    if (id === null) {
      throw new AppError('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    }
    const state: ConversationState = await this.service.get(id);
    res.json(this.detail(state));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const ids = parseIds(req.query.ids);
    const found = await this.service.list(ids);
    res.json(
      envelope(
        found.map(({ record, status }) => ({
          id: encodeId('cv', record.id),
          effectiveStatus: status,
          lastInteractionAt: toBusinessIso(record.lastInteractionAt),
        })),
        this.clock,
      ),
    );
  };

  private detail(state: ConversationState) {
    const { record, status, view } = state;
    return {
      conversation: {
        ...conversationBody(record, status),
        startedAt: toBusinessIso(record.startedAt),
        lastInteractionAt: toBusinessIso(record.lastInteractionAt),
      },
      view,
      availableActions: availableActions(status),
    };
  }
}
