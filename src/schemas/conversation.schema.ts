import { z } from 'zod';

export const createConversationSchema = z.object({
  contactId: z.string().min(1).max(64),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const MAX_IDS_PER_LIST = 50;
