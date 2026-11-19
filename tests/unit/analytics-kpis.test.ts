import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsKpis,
  difference,
  percentage,
  type PeriodFacts,
} from '../../src/services/analytics-kpis';

const VAZIO: PeriodFacts = {
  started: 0,
  scheduling: 0,
  confirmed: 0,
  durationsSeconds: [],
  outside: 0,
  totalSlots: 0,
  occupiedSlots: 0,
  searchesWithoutSlots: 0,
};

describe('KPIs de Analytics', () => {
  it('devolve null, e não zero, quando a base é zero', () => {
    expect(percentage(0, 0)).toBeNull();
    expect(percentage(3, 0)).toBeNull();
    expect(difference(null, 40)).toBeNull();
    expect(difference(50, null)).toBeNull();
  });

  it('calcula a porcentagem sem arredondar', () => {
    expect(percentage(1, 3)).toBeCloseTo(33.333, 3);
    expect(percentage(4, 8)).toBe(50);
  });

  it('calcula conclusão com conversas distintas e nunca passa de 100%', () => {
    const kpis = buildAnalyticsKpis({ ...VAZIO, scheduling: 2, confirmed: 2 }, VAZIO);
    expect(kpis.botCompletion.percentage).toBe(100);
    expect(kpis.botCompletion.confirmedConversations).toBe(2);
    expect(kpis.botCompletion.schedulingConversations).toBe(2);
  });

  it('usa a mediana e a amostra das durações, com diferença em segundos', () => {
    const kpis = buildAnalyticsKpis(
      { ...VAZIO, durationsSeconds: [180, 120] },
      { ...VAZIO, durationsSeconds: [240] },
    );
    expect(kpis.attendanceDuration).toEqual({
      statistic: 'median',
      seconds: 150,
      sampleSize: 2,
      previousValue: 240,
      difference: -90,
      differenceUnit: 'seconds',
    });
  });

  it('mantém null na duração sem confirmações, sem inventar amostra', () => {
    const kpis = buildAnalyticsKpis(VAZIO, VAZIO);
    expect(kpis.attendanceDuration).toMatchObject({
      seconds: null,
      sampleSize: 0,
      difference: null,
    });
  });

  it('calcula fora do expediente sobre todas as conversas iniciadas', () => {
    const kpis = buildAnalyticsKpis({ ...VAZIO, started: 5, outside: 3 }, { ...VAZIO, started: 1 });
    expect(kpis.outsideBusinessHours).toMatchObject({
      percentage: 60,
      outsideConversations: 3,
      startedConversations: 5,
      previousValue: 0,
      difference: 60,
      differenceUnit: 'percentage_points',
    });
  });

  it('calcula ocupação somando horários, sem média dos percentuais', () => {
    const kpis = buildAnalyticsKpis({ ...VAZIO, totalSlots: 4, occupiedSlots: 3 }, VAZIO);
    expect(kpis.agendaOccupancy).toMatchObject({
      percentage: 75,
      occupiedSlots: 3,
      totalSlots: 4,
      previousValue: null,
      difference: null,
    });
  });

  it('conta buscas sem horário como contagem, com zero no período anterior', () => {
    const kpis = buildAnalyticsKpis({ ...VAZIO, searchesWithoutSlots: 2 }, VAZIO);
    expect(kpis.searchesWithoutSlots).toEqual({
      count: 2,
      previousValue: 0,
      difference: 2,
      differenceUnit: 'count',
    });
  });
});
