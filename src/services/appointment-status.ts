export type AppointmentStatus = 'pending' | 'complete' | 'cancelled';

/**
 * Status derivado da reserva (contrato, "Status das consultas"): cancelada tem prioridade sobre o
 * tempo; completa quando o fim do horário já passou; pendente nos demais casos.
 */
export function appointmentStatus(
  reserva: { canceladaEm: Date | null; fim: Date },
  agora: Date,
): AppointmentStatus {
  if (reserva.canceladaEm !== null) return 'cancelled';
  if (agora.getTime() >= reserva.fim.getTime()) return 'complete';
  return 'pending';
}

/** Só reserva pendente pode ser cancelada, e só enquanto a conversa estiver ativa. */
export function canCancel(status: AppointmentStatus, conversaAtiva: boolean): boolean {
  return status === 'pending' && conversaAtiva;
}
