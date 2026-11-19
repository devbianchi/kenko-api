import type { AppointmentView } from '../models/conversation.model';
import type { ReservaDaConversa } from '../repositories/reservation.repository';
import { encodeId } from '../shared/opaque-id';
import { appointmentStatus, canCancel } from './appointment-status';

/** Forma de uma reserva na lista da conversa, com status derivado e permissão de cancelamento. */
export function toAppointmentView(
  reserva: ReservaDaConversa,
  agora: Date,
  conversaAtiva: boolean,
): AppointmentView {
  const status = appointmentStatus({ canceladaEm: reserva.canceladaEm, fim: reserva.fim }, agora);
  return {
    id: encodeId('ap', reserva.id),
    status,
    canCancel: canCancel(status, conversaAtiva),
    startsAt: reserva.inicio,
    endsAt: reserva.fim,
    patient: { id: encodeId('pt', reserva.pacienteId), name: reserva.pacienteNome },
    specialty: { id: encodeId('sp', reserva.especialidadeId), name: reserva.especialidadeNome },
    doctor: { id: encodeId('dr', reserva.medicoId), name: reserva.medicoNome },
    room: { id: encodeId('room', reserva.salaId), name: reserva.salaNome },
  };
}
