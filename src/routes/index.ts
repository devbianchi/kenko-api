import { Router } from 'express';
import type { Pool } from 'pg';
import { ClinicController } from '../controllers/clinic.controller';
import { ConversationController } from '../controllers/conversation.controller';
import { ActionRepository } from '../repositories/action.repository';
import { AttemptRepository } from '../repositories/attempt.repository';
import { ClinicRepository } from '../repositories/clinic.repository';
import { ConversationRepository } from '../repositories/conversation.repository';
import { EventRepository } from '../repositories/event.repository';
import { RoteiroRepository } from '../repositories/roteiro.repository';
import { ClinicService } from '../services/clinic.service';
import { ConversationService } from '../services/conversation.service';
import { ConversationViewBuilder } from '../services/conversation-view';
import { InteractionService } from '../services/interaction.service';
import type { Clock } from '../shared/clock';
import { createClinicRouter } from './clinic.routes';
import { createConversationRouter } from './conversation.routes';

export interface RouteDependencies {
  pool: Pool;
  clock: Clock;
}

/** Monta as camadas de cada recurso e agrega as rotas sob /api. */
export function createApiRouter({ pool, clock }: RouteDependencies): Router {
  const clinics = new ClinicRepository(pool);
  const roteiro = new RoteiroRepository(pool);
  const conversations = new ConversationRepository(pool);
  const views = new ConversationViewBuilder(roteiro, clinics);

  const clinicController = new ClinicController(new ClinicService(clinics), clock);

  const conversationController = new ConversationController(
    new ConversationService(pool, conversations, roteiro, views, clock),
    new InteractionService(
      pool,
      conversations,
      roteiro,
      clinics,
      new AttemptRepository(),
      new EventRepository(),
      new ActionRepository(),
      views,
      clock,
    ),
    clock,
  );

  const router = Router();
  router.use('/clinic', createClinicRouter(clinicController));
  router.use('/conversations', createConversationRouter(conversationController));
  return router;
}
