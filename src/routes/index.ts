import { Router } from 'express';
import type { Pool } from 'pg';
import { ClinicController } from '../controllers/clinic.controller';
import { ClinicRepository } from '../repositories/clinic.repository';
import { ClinicService } from '../services/clinic.service';
import type { Clock } from '../shared/clock';
import { createClinicRouter } from './clinic.routes';

export interface RouteDependencies {
  pool: Pool;
  clock: Clock;
}

/** Monta a montagem das camadas e agrega as rotas sob /api. */
export function createApiRouter({ pool, clock }: RouteDependencies): Router {
  const clinicController = new ClinicController(
    new ClinicService(new ClinicRepository(pool)),
    clock,
  );

  const router = Router();
  router.use('/clinic', createClinicRouter(clinicController));
  return router;
}
