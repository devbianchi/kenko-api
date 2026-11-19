import type { Request, Response } from 'express';
import type { AnalyticsService } from '../services/analytics.service';
import type { Clock } from '../shared/clock';
import { envelope } from '../shared/envelope';

/** Adapta HTTP ao serviço de Analytics. Um único instante de avaliação por requisição. */
export class AnalyticsController {
  constructor(
    private readonly service: AnalyticsService,
    private readonly clock: Clock,
  ) {}

  get = async (req: Request, res: Response): Promise<void> => {
    const now = this.clock.now();
    const result = await this.service.get(req.query.period, req.query.reference, now);
    const body = envelope(
      { kpis: result.kpis, funnel: result.funnel, conversationEndings: result.conversationEndings },
      { now: () => now },
    );
    res.json({
      meta: { ...body.meta, period: result.period, previousPeriod: result.previousPeriod },
      data: body.data,
    });
  };
}
