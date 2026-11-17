export const BUSINESS_TIMEZONE = 'America/Sao_Paulo';

/** Instante de avaliação. Toda regra que depende do tempo recebe um Clock, nunca usa Date diretamente (ADR-0005). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function fixedClock(instant: string): Clock {
  const time = new Date(instant).getTime();
  return {
    now: () => new Date(time),
  };
}
