import { describe, expect, it } from 'vitest';
import { buildDurationDistribution, buildHeatmap } from '../../src/services/analytics-distribution';

describe('distribuição de duração', () => {
  it('posiciona cada duração na barra de um minuto, com 10+ a partir de dez minutos', () => {
    const { buckets } = buildDurationDistribution([0, 59.9, 60, 540, 599, 600, 3_600]);
    expect(buckets[0]).toEqual({ label: '1', fromInclusive: 0, toExclusive: 60, count: 2 });
    expect(buckets[1]).toMatchObject({ label: '2', count: 1 });
    expect(buckets[9]).toEqual({ label: '10', fromInclusive: 540, toExclusive: 600, count: 2 });
    expect(buckets[10]).toEqual({ label: '10+', fromInclusive: 600, toExclusive: null, count: 2 });
  });

  it('usa a mediana e a nona menor duração como P90 quando há dez conversas', () => {
    const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 500];
    const distribution = buildDurationDistribution(durations);
    expect(distribution.sampleSize).toBe(10);
    expect(distribution.median).toBe(55);
    expect(distribution.p90).toBe(90);
  });

  it('calcula P90 com ceil(0,90 × N) em N não múltiplo de dez', () => {
    // N = 4: ceil(3,6) = 4, a maior duração.
    expect(buildDurationDistribution([60, 120, 180, 720]).p90).toBe(720);
  });

  it('devolve estatísticas null e barras zeradas sem amostras', () => {
    const distribution = buildDurationDistribution([]);
    expect(distribution).toMatchObject({ sampleSize: 0, median: null, p90: null });
    expect(distribution.buckets.every((bucket) => bucket.count === 0)).toBe(true);
    expect(distribution.buckets).toHaveLength(11);
  });
});

describe('mapa de calor', () => {
  it('devolve sete dias de segunda a domingo com doze faixas, zeradas quando não há registro', () => {
    const heatmap = buildHeatmap([{ weekday: 1, bucket: 4, count: 2 }]);
    expect(heatmap.bucketStartHours).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
    expect(heatmap.rows.map((row) => row.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(heatmap.rows[0]!.counts).toEqual([0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(heatmap.rows[6]!.counts.every((count) => count === 0)).toBe(true);
  });
});
