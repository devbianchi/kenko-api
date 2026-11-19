import { describe, expect, it } from 'vitest';
import { buildCompletionSeries } from '../../src/services/analytics-series';

describe('série de conclusão', () => {
  it('calcula a média móvel dos últimos três pontos com percentuais calculáveis (exemplo do contrato)', () => {
    const series = buildCompletionSeries('month', '2026-11-01', '2026-12-01', [
      { date: '2026-11-02', started: 2, confirmed: 1 },
      { date: '2026-11-09', started: 2, confirmed: 1 },
      { date: '2026-11-16', started: 1, confirmed: 0 },
      { date: '2026-11-23', started: 2, confirmed: 1 },
      { date: '2026-11-29', started: 1, confirmed: 1 },
    ]);
    expect(series.points.map((point) => point.label)).toEqual([
      '01–07',
      '08–14',
      '15–21',
      '22–28',
      '29–30',
    ]);
    expect(series.points.map((point) => point.percentage)).toEqual([50, 50, 0, 50, 100]);
    expect(series.points.map((point) => point.movingAverage)).toEqual([
      50,
      50,
      (50 + 50 + 0) / 3,
      (50 + 0 + 50) / 3,
      (0 + 50 + 100) / 3,
    ]);
  });

  it('deixa percentuais sem base como null e os deixa fora da média', () => {
    const series = buildCompletionSeries('month', '2026-11-01', '2026-12-01', [
      { date: '2026-11-02', started: 2, confirmed: 1 },
    ]);
    expect(series.points[1]).toMatchObject({ started: 0, percentage: null, movingAverage: 50 });
    expect(series.points[4]).toMatchObject({ percentage: null, movingAverage: null });
  });

  it('devolve média null quando nenhum ponto da janela tem base', () => {
    const series = buildCompletionSeries('month', '2026-11-01', '2026-12-01', []);
    expect(series.points.every((point) => point.movingAverage === null)).toBe(true);
  });

  it('usa um bloco 29–fim apenas quando o mês tem esse dia', () => {
    const fevereiro = buildCompletionSeries('month', '2026-02-01', '2026-03-01', []);
    expect(fevereiro.points.map((point) => point.label)).toEqual([
      '01–07',
      '08–14',
      '15–21',
      '22–28',
    ]);
  });

  it('usa dias na semana e meses no ano', () => {
    const semana = buildCompletionSeries('week', '2026-11-04', '2026-11-11', []);
    expect(semana.points).toHaveLength(7);
    expect(semana.points[0]!.label).toBe('04/11');

    const ano = buildCompletionSeries('year', '2026-01-01', '2026-11-01', []);
    expect(ano.points).toHaveLength(10);
    expect(ano.points[0]!.label).toBe('01/2026');
  });
});
