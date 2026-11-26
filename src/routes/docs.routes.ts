import { Router } from 'express';
import type { DocsController } from '../controllers/docs.controller';

export function createDocsRouter(controller: DocsController): Router {
  const router = Router();
  router.get('/', controller.get);
  return router;
}
