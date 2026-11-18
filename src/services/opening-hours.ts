import type { DaySchedule, OpeningHoursItem } from '../models/clinic.model';

/** Ordem da semana usada pelo contrato: segunda a sábado e, por último, domingo (0). */
export const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

interface Group {
  weekdays: number[];
  schedule: DaySchedule;
  lastIndex: number;
}

function toHHMM(time: string): string {
  return time.slice(0, 5);
}

function toItem(group: Group): OpeningHoursItem {
  const { weekdays, schedule } = group;
  if (schedule.opensAt === null || schedule.closesAt === null) {
    return { weekdays, closed: true };
  }
  return {
    weekdays,
    opensAt: toHHMM(schedule.opensAt),
    closesAt: toHHMM(schedule.closesAt),
  };
}

/**
 * Agrupa o expediente no formato de openingHours. Dias consecutivos na ordem da semana, com o mesmo
 * horário, viram um único item. Um dia sem registro não aparece na lista.
 */
export function groupOpeningHours(days: DaySchedule[]): OpeningHoursItem[] {
  const byWeekday = new Map(days.map((day) => [day.weekday, day]));
  const groups: Group[] = [];

  WEEK_ORDER.forEach((weekday, index) => {
    const day = byWeekday.get(weekday);
    if (!day) return;

    const last = groups[groups.length - 1];
    const sameHours =
      last !== undefined &&
      last.schedule.opensAt === day.opensAt &&
      last.schedule.closesAt === day.closesAt;

    if (last !== undefined && sameHours && last.lastIndex === index - 1) {
      last.weekdays.push(weekday);
      last.lastIndex = index;
    } else {
      groups.push({ weekdays: [weekday], schedule: day, lastIndex: index });
    }
  });

  return groups.map(toItem);
}

/**
 * Diz se a clínica está aberta em um dia e horário (HH:MM). Abertura é incluída e fechamento é excluído.
 */
export function isWithinOpeningHours(days: DaySchedule[], weekday: number, time: string): boolean {
  const day = days.find((d) => d.weekday === weekday);
  if (!day || day.opensAt === null || day.closesAt === null) return false;
  return toHHMM(day.opensAt) <= time && time < toHHMM(day.closesAt);
}
