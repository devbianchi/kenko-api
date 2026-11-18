import type { EffectiveStatus } from '../models/conversation.model';

/** Limite de inatividade a partir do qual a conversa é tratada como abandonada (RF-10). */
export const ABANDONMENT_LIMIT_MS = 60 * 60 * 1000;

/**
 * Estado efetivo calculado no momento da leitura, nunca gravado. Uma conversa encerrada por Sair
 * continua encerrada. Exatamente uma hora de inatividade ainda é ativa; depois disso, abandonada.
 */
export function effectiveStatus(
  conversation: { closedAt: Date | null; lastInteractionAt: Date },
  now: Date,
): EffectiveStatus {
  if (conversation.closedAt !== null) return 'closed';
  const inactiveMs = now.getTime() - conversation.lastInteractionAt.getTime();
  return inactiveMs > ABANDONMENT_LIMIT_MS ? 'abandoned' : 'active';
}
