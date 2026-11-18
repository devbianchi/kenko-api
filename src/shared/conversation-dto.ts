import type {
  BotMessage,
  ConversationRecord,
  ConversationView,
  EffectiveStatus,
  SlotView,
} from '../models/conversation.model';
import { toBusinessIso } from './business-time';
import { encodeId } from './opaque-id';

/** Campos de conversa que todo endpoint de conversa devolve. */
export function conversationBody(record: ConversationRecord, status: EffectiveStatus) {
  return {
    id: encodeId('cv', record.id),
    effectiveStatus: status,
    revision: record.revision,
    step: record.step,
    attemptId: record.attemptId === null ? null : encodeId('attempt', record.attemptId),
  };
}

export function availableActions(status: EffectiveStatus): string[] {
  return status === 'active' ? ['exit'] : [];
}

export function messageBody(message: BotMessage) {
  return {
    id: message.id,
    author: message.author,
    text: message.text,
    sentAt: toBusinessIso(message.sentAt),
  };
}

function slotBody(slot: SlotView) {
  return {
    id: slot.id,
    startsAt: toBusinessIso(slot.startsAt),
    endsAt: toBusinessIso(slot.endsAt),
    doctor: slot.doctor,
    room: slot.room,
  };
}

export function viewBody(view: ConversationView) {
  if (view.type === 'slots') {
    return {
      type: 'slots' as const,
      searchResult: view.searchResult,
      slots: view.slots.map(slotBody),
    };
  }
  if (view.type === 'patient_form') {
    return {
      type: 'patient_form' as const,
      fields: view.fields,
      selectedSlot: view.selectedSlot === null ? null : slotBody(view.selectedSlot),
    };
  }
  return view;
}

/** Resultado de uma confirmação de agendamento. */
export interface AppointmentResult {
  type: 'appointment_confirmed';
  appointment: {
    id: string;
    conversationId: string;
    patientId: string;
    slotId: string;
    status: 'pending';
    confirmedAt: string;
    startsAt: string;
    endsAt: string;
  };
}

/** Resposta de uma interação. É guardada para devolver o mesmo resultado em reenvios (ADR-0006). */
export interface InteractionDto {
  conversation: ReturnType<typeof conversationBody>;
  messages: ReturnType<typeof messageBody>[];
  view: ReturnType<typeof viewBody>;
  availableActions: string[];
  result: AppointmentResult | null;
}

export function interactionDto(
  record: ConversationRecord,
  status: EffectiveStatus,
  view: ConversationView,
  messages: BotMessage[],
  result: AppointmentResult | null = null,
): InteractionDto {
  return {
    conversation: conversationBody(record, status),
    messages: messages.map(messageBody),
    view: viewBody(view),
    availableActions: availableActions(status),
    result,
  };
}

/** Erro de disputa de horário: traz a nova tela de horários, para o cliente não descartá-la. */
export function slotUnavailableBody(dto: InteractionDto, message: string) {
  return {
    error: { code: 'SLOT_UNAVAILABLE', message },
    conversation: dto.conversation,
    messages: dto.messages,
    view: dto.view,
    availableActions: dto.availableActions,
    result: null,
  };
}

/** Resultado guardado de uma ação: o status HTTP e o corpo devolvidos. */
export interface ActionOutcome {
  status: number;
  body: unknown;
}
