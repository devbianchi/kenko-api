import { Router } from 'express';
import type { ClinicController } from '../controllers/clinic.controller';

export function createClinicRouter(controller: ClinicController): Router {
  const router = Router();
  router.get('/', controller.getClinic);
  return router;
}
