import { Router } from 'express';
import type { CalendarController } from '../controllers/calendar.controller';

export function createCalendarRouter(controller: CalendarController): Router {
  const router = Router();
  router.get('/', controller.calendar);
  router.get('/days/:date', controller.day);
  return router;
}
