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
  patientId: number | null;
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
  doctor: { id: string; name: string };
  room: { id: string; name: string };
}

/** Resultado da busca de horários, quando a tela depende dela. */
export type SearchResult = 'available' | 'no_slots';

export interface PatientFormView {
  type: 'patient_form';
  fields: { name: string; type: 'text' | 'date'; required: true }[];
  selectedSlot: SlotView | null;
}

export type ConversationView =
  | { type: 'options'; options: ViewOption[]; searchResult?: SearchResult }
  | { type: 'slots'; searchResult: 'available'; slots: SlotView[] }
  | PatientFormView
  | { type: 'closed' };

export interface BotMessage {
  id: string;
  author: 'bot';
  text: string;
  sentAt: Date;
}
