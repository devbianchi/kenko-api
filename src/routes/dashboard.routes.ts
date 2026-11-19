import { Router } from 'express';
import type { DashboardController } from '../controllers/dashboard.controller';

export function createDashboardRouter(controller: DashboardController): Router {
  const router = Router();
  router.get('/', controller.get);
  return router;
}
