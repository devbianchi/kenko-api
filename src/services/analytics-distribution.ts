import { median } from './dashboard-summary';

/** Barras de um minuto: 1 é [0, 60), 10 é [540, 600) e "10+" é [600, +∞). */
const BUCKET_COUNT = 11;
const LAST_BUCKET = BUCKET_COUNT - 1;
const BUCKET_SECONDS = 60;

export interface DurationBucket {
  label: string;
  fromInclusive: number;
  toExclusive: number | null;
  count: number;
}

/** Distribuição da duração até a primeira confirmação, uma amostra por conversa. */
export function buildDurationDistribution(durationsSeconds: number[]) {
  const sorted = [...durationsSeconds].sort((a, b) => a - b);
  const sampleSize = sorted.length;

  const counts = new Array<number>(BUCKET_COUNT).fill(0);
  for (const seconds of sorted) {
    const index = Math.min(Math.max(Math.floor(seconds / BUCKET_SECONDS), 0), LAST_BUCKET);
    counts[index]! += 1;
  }

  const buckets: DurationBucket[] = counts.map((count, index) => {
    if (index === LAST_BUCKET) {
      return { label: '10+', fromInclusive: index * BUCKET_SECONDS, toExclusive: null, count };
    }
    return {
      label: String(index + 1),
      fromInclusive: index * BUCKET_SECONDS,
      toExclusive: (index + 1) * BUCKET_SECONDS,
      count,
    };
  });

  // P90 é a posição ceil(0,90 × N), contada a partir de 1. Calculada em inteiros para evitar erro de ponto flutuante.
  const p90Position = Math.ceil((9 * sampleSize) / 10);

  return {
    unit: 'seconds' as const,
    sampleSize,
    median: median(durationsSeconds),
    p90: sampleSize === 0 ? null : sorted[p90Position - 1]!,
    buckets,
  };
}

/** Dias da semana na ordem do contrato: segunda a sábado e, por último, domingo (0). */
export const HEATMAP_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const HEATMAP_BUCKET_HOURS = 12;

export interface HeatmapCell {
  weekday: number;
  /** Faixa de duas horas: 0 é 00h–02h, 11 é 22h–24h. */
  bucket: number;
  count: number;
}

/** Mapa de calor de inícios de conversa: 7 dias por 12 faixas de duas horas, com zeros onde não há registro. */
export function buildHeatmap(cells: HeatmapCell[]) {
  return {
    bucketStartHours: Array.from({ length: HEATMAP_BUCKET_HOURS }, (_, bucket) => bucket * 2),
    rows: HEATMAP_WEEKDAYS.map((weekday) => ({
      weekday,
      counts: Array.from({ length: HEATMAP_BUCKET_HOURS }, (_, bucket) =>
        cells
          .filter((cell) => cell.weekday === weekday && cell.bucket === bucket)
          .reduce((sum, cell) => sum + cell.count, 0),
      ),
    })),
  };
}
