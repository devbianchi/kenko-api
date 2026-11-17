import type { Clock } from './clock';
import { BUSINESS_TIMEZONE } from './clock';
import { toBusinessIso } from './business-time';

/** Envelope de sucesso da API: {meta, data}, com o instante de avaliação único da requisição. */
export function envelope<T>(data: T, clock: Clock) {
  return {
    meta: {
      timezone: BUSINESS_TIMEZONE,
      evaluatedAt: toBusinessIso(clock.now()),
    },
    data,
  };
}
