import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type { ConversationService, ConversationState } from '../services/conversation.service';
import type { InteractionService } from '../services/interaction.service';
import { MAX_IDS_PER_LIST, createConversationSchema } from '../schemas/conversation.schema';
import { interactionBodySchema } from '../schemas/interaction.schema';
import {
  availableActions,
  conversationBody,
  messageBody,
  viewBody,
} from '../shared/conversation-dto';
import { envelope } from '../shared/envelope';
import { toAppointmentView } from '../services/appointment-view';
import { appointmentBody } from '../shared/conversation-dto';
import type { Clock } from '../shared/clock';
import { toBusinessIso } from '../shared/business-time';
import { decodeId, encodeId } from '../shared/opaque-id';

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

function parseInteractionBody(body: unknown) {
  const parsed = interactionBodySchema.safeParse(body);
  if (parsed.success) return parsed.data;

  const campos = typeof body === 'object' && body !== null ? body : {};
  const faltando = ['actionId', 'expectedRevision', 'input'].filter((c) => !(c in campos));
  if (faltando.length > 0) {
    const fields = Object.fromEntries(faltando.map((campo) => [campo, 'Obrigatório.']));
    throw new AppError('MISSING_PARAMETER', 'Campo obrigatório ausente.', fields);
  }
  throw new AppError('INVALID_INPUT_TYPE', 'Ação inválida para o tipo informado.', {
    input: 'Tipo ou campos inválidos.',
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

function conversationIdParam(req: Request): number {
  const id = decodeId('cv', String(req.params.id));
  if (id === null) {
    throw new AppError('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
  }
  return id;
}

/** Adapta HTTP aos serviços: valida a entrada, chama o serviço e responde no formato do contrato. */
export class ConversationController {
  constructor(
    private readonly service: ConversationService,
    private readonly interactions: InteractionService,
    private readonly clock: Clock,
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const { contactId } = parseCreateBody(req.body);
    const result = await this.service.create(contactId);
    const status = result.state.status;

    res.status(result.created ? 201 : 200).json({
      conversation: conversationBody(result.state.record, status),
      messages: result.messages.map(messageBody),
      view: viewBody(result.state.view),
      availableActions: availableActions(status),
    });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const state: ConversationState = await this.service.get(conversationIdParam(req));
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

  appointments = async (req: Request, res: Response): Promise<void> => {
    const id = conversationIdParam(req);
    const lista = await this.service.listAppointments(id);
    const agora = this.clock.now();
    res.json(
      envelope(
        lista.map(({ reserva, status }) =>
          appointmentBody(toAppointmentView(reserva, agora, status === 'active')),
        ),
        this.clock,
      ),
    );
  };

  interact = async (req: Request, res: Response): Promise<void> => {
    const id = conversationIdParam(req);
    const body = parseInteractionBody(req.body);
    const outcome = await this.interactions.process(id, body);
    res.status(outcome.status).json(outcome.body);
  };

  private detail(state: ConversationState) {
    const { record, status, view } = state;
    return {
      conversation: {
        ...conversationBody(record, status),
        startedAt: toBusinessIso(record.startedAt),
        lastInteractionAt: toBusinessIso(record.lastInteractionAt),
      },
      view: viewBody(view),
      availableActions: availableActions(status),
    };
  }
}
