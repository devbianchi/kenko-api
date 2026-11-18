export type EffectiveStatus = 'active' | 'closed' | 'abandoned';

/** Conversa como está no banco, com o passo atual já traduzido para o código técnico. */
export interface ConversationRecord {
  id: number;
  step: string;
  revision: number;
  startedAt: Date;
  lastInteractionAt: Date;
  closedAt: Date | null;
  attemptId: number | null;
}

export interface ViewOption {
  id: string;
  label: string;
}

/** Horário oferecido numa tentativa. A busca que preenche esta lista entra na fase 5c. */
export interface SlotView {
  id: string;
  startsAt: Date;
  endsAt: Date;
  doctorName: string;
  roomName: string;
}

export type ConversationView =
  | { type: 'options'; options: ViewOption[] }
  | { type: 'slots'; slots: SlotView[] }
  | { type: 'closed' };

export interface BotMessage {
  id: string;
  author: 'bot';
  text: string;
  sentAt: Date;
}
