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

export type ConversationView = { type: 'options'; options: ViewOption[] } | { type: 'closed' };

export interface BotMessage {
  id: string;
  author: 'bot';
  text: string;
  sentAt: Date;
}
