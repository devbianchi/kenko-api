import { Router } from 'express';
import type { Pool } from 'pg';
import { CalendarController } from '../controllers/calendar.controller';
import { ClinicController } from '../controllers/clinic.controller';
import { ConversationController } from '../controllers/conversation.controller';
import { ActionRepository } from '../repositories/action.repository';
import { AttemptRepository } from '../repositories/attempt.repository';
import { CalendarRepository } from '../repositories/calendar.repository';
import { ClinicRepository } from '../repositories/clinic.repository';
import { ConversationRepository } from '../repositories/conversation.repository';
import { EventRepository } from '../repositories/event.repository';
import { PatientRepository } from '../repositories/patient.repository';
import { ReservationRepository } from '../repositories/reservation.repository';
import { RoteiroRepository } from '../repositories/roteiro.repository';
import { SlotRepository } from '../repositories/slot.repository';
import { CalendarService } from '../services/calendar.service';
import { ClinicService } from '../services/clinic.service';
import { ConversationService } from '../services/conversation.service';
import { ConversationViewBuilder } from '../services/conversation-view';
import { InteractionService } from '../services/interaction.service';
import type { Clock } from '../shared/clock';
import { createCalendarRouter } from './calendar.routes';
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
  const slots = new SlotRepository();
  const attempts = new AttemptRepository();
  const reservations = new ReservationRepository();
  const views = new ConversationViewBuilder(pool, roteiro, clinics, slots, attempts, reservations);

  const clinicController = new ClinicController(new ClinicService(clinics), clock);

  const conversationController = new ConversationController(
    new ConversationService(pool, conversations, roteiro, views, reservations, clock),
    new InteractionService(
      pool,
      conversations,
      roteiro,
      clinics,
      attempts,
      new EventRepository(),
      new ActionRepository(),
      slots,
      new PatientRepository(),
      reservations,
      views,
      clock,
    ),
    clock,
  );

  const calendarController = new CalendarController(
    new CalendarService(pool, new CalendarRepository(), clock),
    clock,
  );

  const router = Router();
  router.use('/calendar', createCalendarRouter(calendarController));
  router.use('/clinic', createClinicRouter(clinicController));
  router.use('/conversations', createConversationRouter(conversationController));
  return router;
}
