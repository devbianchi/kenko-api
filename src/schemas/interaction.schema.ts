import { z } from 'zod';

export const interactionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('select_option'), optionId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('select_slot'), slotId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('submit_patient'),
    patient: z.object({ name: z.string(), birthDate: z.string() }),
  }),
  z.object({ type: z.literal('cancel_appointment'), appointmentId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('exit') }),
]);

export type InteractionInput = z.infer<typeof interactionInputSchema>;

export const interactionBodySchema = z.object({
  actionId: z.string().min(1).max(64),
  expectedRevision: z.number().int().nonnegative(),
  input: interactionInputSchema,
});

export type InteractionBody = z.infer<typeof interactionBodySchema>;
