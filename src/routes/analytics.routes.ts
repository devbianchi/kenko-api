import { Router } from 'express';
import type { AnalyticsController } from '../controllers/analytics.controller';

export function createAnalyticsRouter(controller: AnalyticsController): Router {
  const router = Router();
  router.get('/', controller.get);
  return router;
}
