import type { AnalyticsRepository } from '../repositories/analytics.repository';
import { dataLocal } from '../shared/datas';
import { buildAnalyticsKpis } from './analytics-kpis';
import { buildEndings, buildFunnel } from './analytics-funnel';
import { localMidnight, resolveAnalyticsPeriod } from './analytics-period';

/** Leituras de Analytics. Não altera nada: o instante de avaliação vem de quem chama, uma vez por requisição. */
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  async get(period: unknown, reference: unknown, now: Date) {
    const resolved = resolveAnalyticsPeriod(period, reference, dataLocal(now));
    const inicio = localMidnight(resolved.start);
    const fim = localMidnight(resolved.endExclusive);
    const previousInicio = localMidnight(resolved.previousStart);
    const previousFim = localMidnight(resolved.previousEndExclusive);

    const [current, previous, funnel, endings] = await Promise.all([
      this.analytics.facts(inicio, fim, now),
      this.analytics.facts(previousInicio, previousFim, now),
      this.analytics.funnel(inicio, fim, now),
      this.analytics.endings(inicio, fim, now),
    ]);

    return {
      period: {
        type: resolved.type,
        reference: resolved.reference,
        start: inicio,
        endExclusive: fim,
      },
      previousPeriod: {
        start: previousInicio,
        endExclusive: previousFim,
      },
      kpis: buildAnalyticsKpis(current, previous),
      funnel: buildFunnel(funnel),
      conversationEndings: buildEndings(endings),
    };
  }
}
