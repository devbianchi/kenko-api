import { median } from './dashboard-summary';

/** Fatos contados num período. Conversas entram pela data de início; horários e buscas, pela data própria. */
export interface PeriodFacts {
  /** Conversas iniciadas no período (base de fora do expediente). */
  started: number;
  /** Conversas que escolheram Agendar (base da conclusão). */
  scheduling: number;
  /** Conversas que escolheram Agendar e confirmaram pelo menos uma consulta. */
  confirmed: number;
  /** Uma duração por conversa confirmada, do início até a primeira confirmação, em segundos. */
  durationsSeconds: number[];
  /** Conversas iniciadas fora do expediente. */
  outside: number;
  /** Horários com início no período, inclusive os futuros. */
  totalSlots: number;
  /** Horários do período com alguma reserva não cancelada. */
  occupiedSlots: number;
  /** Ocorrências de busca sem horário no período. */
  searchesWithoutSlots: number;
}

/** Razão em porcentagem, sem arredondar. Sem base, o resultado é null (não zero). */
export function percentage(part: number, base: number): number | null {
  return base === 0 ? null : (100 * part) / base;
}

/** Diferença entre o atual e o anterior. Null quando qualquer dos dois não existe. */
export function difference(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}

/** Os cinco KPIs de Analytics, nas duas janelas. */
export function buildAnalyticsKpis(current: PeriodFacts, previous: PeriodFacts) {
  const botCompletion = percentage(current.confirmed, current.scheduling);
  const previousBotCompletion = percentage(previous.confirmed, previous.scheduling);

  const attendanceSeconds = median(current.durationsSeconds);
  const previousAttendanceSeconds = median(previous.durationsSeconds);

  const outside = percentage(current.outside, current.started);
  const previousOutside = percentage(previous.outside, previous.started);

  const occupancy = percentage(current.occupiedSlots, current.totalSlots);
  const previousOccupancy = percentage(previous.occupiedSlots, previous.totalSlots);

  return {
    botCompletion: {
      percentage: botCompletion,
      confirmedConversations: current.confirmed,
      schedulingConversations: current.scheduling,
      previousValue: previousBotCompletion,
      difference: difference(botCompletion, previousBotCompletion),
      differenceUnit: 'percentage_points' as const,
    },
    attendanceDuration: {
      statistic: 'median' as const,
      seconds: attendanceSeconds,
      sampleSize: current.durationsSeconds.length,
      previousValue: previousAttendanceSeconds,
      difference: difference(attendanceSeconds, previousAttendanceSeconds),
      differenceUnit: 'seconds' as const,
    },
    outsideBusinessHours: {
      percentage: outside,
      outsideConversations: current.outside,
      startedConversations: current.started,
      previousValue: previousOutside,
      difference: difference(outside, previousOutside),
      differenceUnit: 'percentage_points' as const,
    },
    agendaOccupancy: {
      percentage: occupancy,
      occupiedSlots: current.occupiedSlots,
      totalSlots: current.totalSlots,
      previousValue: previousOccupancy,
      difference: difference(occupancy, previousOccupancy),
      differenceUnit: 'percentage_points' as const,
    },
    searchesWithoutSlots: {
      count: current.searchesWithoutSlots,
      previousValue: previous.searchesWithoutSlots,
      difference: current.searchesWithoutSlots - previous.searchesWithoutSlots,
      differenceUnit: 'count' as const,
    },
  };
}
