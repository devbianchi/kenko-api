import { type AppointmentStatus, appointmentStatus } from './appointment-status';

/** Consulta de um dia, já com a hora local e a sala. Não usa nome de paciente. */
export interface DayAppointment {
  salaId: number;
  /** Hora local de início, de 0 a 23. */
  hora: number;
  canceladaEm: Date | null;
  fim: Date;
}

export interface DaySummary {
  total: number;
  complete: number;
  pending: number;
  cancelled: number;
  /** 100 × concluídas ÷ total. Null sem consultas, pois não há base. */
  completionPercentage: number | null;
  appointmentsByHour: { hours: number[]; counts: number[] };
  appointmentsByDayPeriod: { morning: number; afternoon: number };
}

/** Manhã é antes de 12h; tarde é a partir de 12h (escopo, RF-13). */
const CORTE_MANHA_TARDE = 12;

function horas(): number[] {
  return Array.from({ length: 24 }, (_, hora) => hora);
}

/** Totais por status, distribuição por hora e por período do dia. Contagens incluem canceladas (RN-23). */
export function summarizeDay(consultas: DayAppointment[], agora: Date): DaySummary {
  const contagemPorStatus: Record<AppointmentStatus, number> = {
    pending: 0,
    complete: 0,
    cancelled: 0,
  };
  const porHora = new Array<number>(24).fill(0);
  let manha = 0;
  let tarde = 0;

  for (const consulta of consultas) {
    const status = appointmentStatus(
      { canceladaEm: consulta.canceladaEm, fim: consulta.fim },
      agora,
    );
    contagemPorStatus[status] += 1;
    porHora[consulta.hora] = (porHora[consulta.hora] ?? 0) + 1;
    if (consulta.hora < CORTE_MANHA_TARDE) manha += 1;
    else tarde += 1;
  }

  const total = consultas.length;
  return {
    total,
    complete: contagemPorStatus.complete,
    pending: contagemPorStatus.pending,
    cancelled: contagemPorStatus.cancelled,
    completionPercentage: total === 0 ? null : (100 * contagemPorStatus.complete) / total,
    appointmentsByHour: { hours: horas(), counts: porHora },
    appointmentsByDayPeriod: { morning: manha, afternoon: tarde },
  };
}

/**
 * Hora de pico de uma sala: a hora com mais consultas, contando canceladas. Empate fica com a hora
 * mais cedo. Sem consultas, não há pico.
 */
export function peakHour(consultas: DayAppointment[]): number | null {
  if (consultas.length === 0) return null;
  const porHora = new Map<number, number>();
  for (const consulta of consultas) {
    porHora.set(consulta.hora, (porHora.get(consulta.hora) ?? 0) + 1);
  }
  let melhor: number | null = null;
  let maior = -1;
  for (const hora of [...porHora.keys()].sort((a, b) => a - b)) {
    const quantidade = porHora.get(hora)!;
    if (quantidade > maior) {
      maior = quantidade;
      melhor = hora;
    }
  }
  return melhor;
}

/**
 * Ocupação por contagem: 100 × horários com reserva não cancelada ÷ horários totais da sala na data.
 * Sem horários cadastrados, não há capacidade e a ocupação é null (RN-23, MET-D06).
 */
export function occupancyPercentage(ocupados: number, totalHorarios: number): number | null {
  if (totalHorarios === 0) return null;
  return (100 * ocupados) / totalHorarios;
}
