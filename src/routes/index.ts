import { Router } from 'express';
import type { Pool } from 'pg';
import { ClinicController } from '../controllers/clinic.controller';
import { ConversationController } from '../controllers/conversation.controller';
import { ClinicRepository } from '../repositories/clinic.repository';
import { ConversationRepository } from '../repositories/conversation.repository';
import { RoteiroRepository } from '../repositories/roteiro.repository';
import { ClinicService } from '../services/clinic.service';
import { ConversationService } from '../services/conversation.service';
import type { Clock } from '../shared/clock';
import { createClinicRouter } from './clinic.routes';
import { createConversationRouter } from './conversation.routes';

export interface RouteDependencies {
  pool: Pool;
  clock: Clock;
}

/** Monta as camadas de cada recurso e agrega as rotas sob /api. */
export function createApiRouter({ pool, clock }: RouteDependencies): Router {
  const clinicController = new ClinicController(
    new ClinicService(new ClinicRepository(pool)),
    clock,
  );

  const conversationController = new ConversationController(
    new ConversationService(
      pool,
      new ConversationRepository(pool),
      new RoteiroRepository(pool),
      clock,
    ),
    clock,
  );

  const router = Router();
  router.use('/clinic', createClinicRouter(clinicController));
  router.use('/conversations', createConversationRouter(conversationController));
  return router;
}
