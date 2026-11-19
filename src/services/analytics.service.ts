import type { AnalyticsRepository } from '../repositories/analytics.repository';
import { dataLocal } from '../shared/datas';
import { buildAnalyticsKpis } from './analytics-kpis';
import { localMidnight, resolveAnalyticsPeriod } from './analytics-period';

/** Leituras de Analytics. Não altera nada: o instante de avaliação vem de quem chama, uma vez por requisição. */
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  async get(period: unknown, reference: unknown, now: Date) {
    const resolved = resolveAnalyticsPeriod(period, reference, dataLocal(now));
    const [current, previous] = await Promise.all([
      this.analytics.facts(
        localMidnight(resolved.start),
        localMidnight(resolved.endExclusive),
        now,
      ),
      this.analytics.facts(
        localMidnight(resolved.previousStart),
        localMidnight(resolved.previousEndExclusive),
        now,
      ),
    ]);

    return {
      period: {
        type: resolved.type,
        reference: resolved.reference,
        start: localMidnight(resolved.start),
        endExclusive: localMidnight(resolved.endExclusive),
      },
      previousPeriod: {
        start: localMidnight(resolved.previousStart),
        endExclusive: localMidnight(resolved.previousEndExclusive),
      },
      kpis: buildAnalyticsKpis(current, previous),
    };
  }
}
