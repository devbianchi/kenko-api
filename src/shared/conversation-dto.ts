import type {
  BotMessage,
  ConversationRecord,
  ConversationView,
  EffectiveStatus,
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

export function viewBody(view: ConversationView) {
  if (view.type !== 'slots') return view;
  return {
    type: 'slots' as const,
    searchResult: view.searchResult,
    slots: view.slots.map((slot) => ({
      id: slot.id,
      startsAt: toBusinessIso(slot.startsAt),
      endsAt: toBusinessIso(slot.endsAt),
      doctor: slot.doctor,
      room: slot.room,
    })),
  };
}

/** Resposta de uma interação aceita. É guardada para devolver o mesmo resultado em reenvios. */
export interface InteractionDto {
  conversation: ReturnType<typeof conversationBody>;
  messages: ReturnType<typeof messageBody>[];
  view: ReturnType<typeof viewBody>;
  availableActions: string[];
  result: null;
}

export function interactionDto(
  record: ConversationRecord,
  status: EffectiveStatus,
  view: ConversationView,
  messages: BotMessage[],
): InteractionDto {
  return {
    conversation: conversationBody(record, status),
    messages: messages.map(messageBody),
    view: viewBody(view),
    availableActions: availableActions(status),
    result: null,
  };
}
