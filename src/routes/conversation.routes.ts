import { Router } from 'express';
import type { ConversationController } from '../controllers/conversation.controller';

export function createConversationRouter(controller: ConversationController): Router {
  const router = Router();
  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  return router;
}
