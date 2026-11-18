import { Router } from 'express';
import type { ConversationController } from '../controllers/conversation.controller';

export function createConversationRouter(controller: ConversationController): Router {
  const router = Router();
  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.get('/:id/appointments', controller.appointments);
  router.post('/:id/interactions', controller.interact);
  return router;
}
