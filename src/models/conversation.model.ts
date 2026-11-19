import type { OpeningHoursItem } from './clinic.model';
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

/** Reserva listada na conversa, com status derivado e se ainda pode ser cancelada. */
export interface AppointmentView {
  id: string;
  status: 'pending' | 'complete' | 'cancelled';
  canCancel: boolean;
  startsAt: Date;
  endsAt: Date;
  patient: { id: string; name: string };
  specialty: { id: string; name: string };
  doctor: { id: string; name: string };
  room: { id: string; name: string };
}

export interface AppointmentsView {
  type: 'appointments';
  appointments: AppointmentView[];
  options: ViewOption[];
}

export interface ClinicInformation {
  id: string;
  name: string;
  address: string;
  phone: string;
  openingHours: OpeningHoursItem[];
  specialties: { id: string; name: string }[];
}

export interface ClinicInformationView {
  type: 'clinic_information';
  clinic: ClinicInformation | null;
  options: ViewOption[];
}

export type ConversationView =
  | { type: 'options'; options: ViewOption[]; searchResult?: SearchResult }
  | { type: 'slots'; searchResult: 'available'; slots: SlotView[] }
  | PatientFormView
  | AppointmentsView
  | ClinicInformationView
  | { type: 'closed' };

/** O que a montagem da tela precisa saber além do passo. */
export interface ViewContext {
  conversationId: number;
  attemptId: number | null;
  agora: Date;
  /** Se a conversa está ativa. Afeta se uma reserva pode ser cancelada. */
  ativa: boolean;
}

export interface BotMessage {
  id: string;
  author: 'bot';
  text: string;
  sentAt: Date;
}
