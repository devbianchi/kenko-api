import { BUSINESS_TIMEZONE } from './clock';

/** Formata um instante como ISO 8601 com o deslocamento de America/Sao_Paulo, por exemplo 2026-11-10T12:00:00-03:00. */
export function toBusinessIso(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '00';

  const local = `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
  const offsetMinutes = Math.round((Date.parse(`${local}Z`) - instant.getTime()) / 60_000);

  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');

  return `${local}${sign}${hours}:${minutes}`;
}
