import { percentage } from './analytics-kpis';
import { firstOfMonth, shiftDays } from './analytics-period';

export interface DailyCompletion {
  /** Dia local da data de início da conversa, AAAA-MM-DD. */
  date: string;
  /** Conversas que escolheram Agendar nesse dia. */
  started: number;
  /** Dessas, as que confirmaram pelo menos uma consulta. */
  confirmed: number;
}

interface Bucket {
  label: string;
  from: string;
  toInclusive: string;
}

const MOVING_AVERAGE_WINDOW = 3;
const MONTH_BLOCK_STARTS = [1, 8, 15, 22, 29];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function lastDayOfMonth(day: string): string {
  const [year, month] = day.split('-').map(Number) as [number, number];
  return shiftDays(firstOfMonth(year, month + 1), -1);
}

/** Pontos da série conforme o filtro: dias na semana, blocos no mês e meses no ano (MET-A10). */
function buildBuckets(
  type: 'week' | 'month' | 'year',
  start: string,
  endExclusive: string,
): Bucket[] {
  const last = shiftDays(endExclusive, -1);

  if (type === 'week') {
    const days: Bucket[] = [];
    for (let day = start; day <= last; day = shiftDays(day, 1)) {
      days.push({ label: `${day.slice(8, 10)}/${day.slice(5, 7)}`, from: day, toInclusive: day });
    }
    return days;
  }

  if (type === 'month') {
    const monthEnd = last;
    const [year, month] = start.split('-').map(Number) as [number, number];
    const blocks: Bucket[] = [];
    for (const first of MONTH_BLOCK_STARTS) {
      const day = Number(monthEnd.slice(8, 10));
      if (first > day) continue;
      const from = `${year}-${pad(month)}-${pad(first)}`;
      const lastDayOfBlock = first === 29 ? monthEnd.slice(8, 10) : pad(first + 6);
      const to = `${year}-${pad(month)}-${lastDayOfBlock}`;
      blocks.push({ label: `${pad(first)}–${lastDayOfBlock}`, from, toInclusive: to });
    }
    return blocks;
  }

  const months: Bucket[] = [];
  for (let first = start; first <= last; first = firstOfMonthAfter(first)) {
    const monthLast = lastDayOfMonth(first);
    months.push({
      label: `${first.slice(5, 7)}/${first.slice(0, 4)}`,
      from: first,
      toInclusive: monthLast,
    });
  }
  return months;
}

function firstOfMonthAfter(day: string): string {
  const [year, month] = day.split('-').map(Number) as [number, number];
  return firstOfMonth(year, month + 1);
}

/**
 * Série de conclusão. Cada ponto usa a fórmula de MET-A01 para os dias do bloco. A média móvel é a
 * média dos percentuais calculáveis dos últimos três pontos, incluindo o atual; sem base, é null.
 */
export function buildCompletionSeries(
  type: 'week' | 'month' | 'year',
  start: string,
  endExclusive: string,
  daily: DailyCompletion[],
) {
  const points = buildBuckets(type, start, endExclusive).map((bucket) => {
    const inside = daily.filter((row) => row.date >= bucket.from && row.date <= bucket.toInclusive);
    const started = inside.reduce((sum, row) => sum + row.started, 0);
    const confirmed = inside.reduce((sum, row) => sum + row.confirmed, 0);
    return {
      label: bucket.label,
      started,
      confirmed,
      percentage: percentage(confirmed, started),
      movingAverage: null as number | null,
    };
  });

  points.forEach((point, index) => {
    const window = points
      .slice(Math.max(0, index - MOVING_AVERAGE_WINDOW + 1), index + 1)
      .map((item) => item.percentage)
      .filter((value): value is number => value !== null);
    point.movingAverage =
      window.length === 0 ? null : window.reduce((sum, value) => sum + value, 0) / window.length;
  });

  return {
    grouping: type === 'week' ? 'daily' : type === 'month' ? 'month_blocks' : 'monthly',
    movingAverageWindow: MOVING_AVERAGE_WINDOW,
    points,
  };
}
