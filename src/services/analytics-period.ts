import { AppError } from '../errors/app-error';
import { dataExiste } from '../shared/datas';

export type AnalyticsPeriodType = 'week' | 'month' | 'year';

export interface ResolvedPeriod {
  type: AnalyticsPeriodType;
  reference: string;
  /** Primeiro dia incluído, no calendário de Brasília. */
  start: string;
  /** Primeiro dia não incluído. */
  endExclusive: string;
  previousStart: string;
  previousEndExclusive: string;
}

const PERIOD_TYPES: readonly string[] = ['week', 'month', 'year'];
const MONTH_REFERENCE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_REFERENCE = /^\d{4}$/;

/**
 * Início de um dia no fuso de negócio. America/Sao_Paulo não tem horário de verão desde 2019,
 * então o deslocamento é fixo.
 */
export function localMidnight(day: string): string {
  return `${day}T00:00:00-03:00`;
}

function shiftDays(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}

function firstOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

function monthsBetween(start: string, end: string): number {
  const [startYear, startMonth] = start.split('-').map(Number) as [number, number];
  const [endYear, endMonth] = end.split('-').map(Number) as [number, number];
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

function invalidReference(type: AnalyticsPeriodType, format: string): AppError {
  return new AppError('INVALID_PERIOD', `Para period=${type}, reference deve usar ${format}.`, {
    reference: 'Formato inválido.',
  });
}

function futureReference(): AppError {
  return new AppError('FUTURE_PERIOD', 'Período futuro não permitido.', {
    reference: 'Período futuro não permitido.',
  });
}

/**
 * Resolve o período de Analytics a partir de `period` e `reference`, em relação ao dia de hoje
 * no fuso de negócio. O intervalo é de início incluído e fim excluído.
 *
 * O período anterior tem a mesma duração e termina onde o atual começa. Em semana, são sete
 * dias; em mês, o mesmo número de dias; em ano, o mesmo número de meses, para que um ano
 * completo seja comparado com o ano anterior inteiro, mesmo em anos bissextos.
 */
export function resolveAnalyticsPeriod(
  period: unknown,
  reference: unknown,
  today: string,
): ResolvedPeriod {
  if (period === undefined) {
    throw new AppError('MISSING_PARAMETER', 'Parâmetro obrigatório ausente.', {
      period: 'Obrigatório.',
    });
  }
  if (reference === undefined) {
    throw new AppError('MISSING_PARAMETER', 'Parâmetro obrigatório ausente.', {
      reference: 'Obrigatório.',
    });
  }
  if (typeof period !== 'string' || !PERIOD_TYPES.includes(period)) {
    throw new AppError('INVALID_PERIOD', 'Tipo de período inválido.', {
      period: 'Valores aceitos: week, month, year.',
    });
  }
  const type = period as AnalyticsPeriodType;
  if (typeof reference !== 'string') {
    throw invalidReference(type, formatFor(type));
  }

  if (type === 'week') {
    if (!dataExiste(reference)) throw invalidReference(type, 'YYYY-MM-DD');
    if (reference > today) throw futureReference();
    const start = shiftDays(reference, -6);
    const endExclusive = shiftDays(reference, 1);
    return {
      type,
      reference,
      start,
      endExclusive,
      previousStart: shiftDays(start, -7),
      previousEndExclusive: start,
    };
  }

  if (type === 'month') {
    if (!MONTH_REFERENCE.test(reference)) throw invalidReference(type, 'YYYY-MM');
    if (reference > today.slice(0, 7)) throw futureReference();
    const [year, month] = reference.split('-').map(Number) as [number, number];
    const start = firstOfMonth(year, month);
    const endExclusive = firstOfMonth(year, month + 1);
    const days = daysBetween(start, endExclusive);
    return {
      type,
      reference,
      start,
      endExclusive,
      previousStart: shiftDays(start, -days),
      previousEndExclusive: start,
    };
  }

  if (!YEAR_REFERENCE.test(reference) || reference === '0000') {
    throw invalidReference(type, 'YYYY');
  }
  const year = Number(reference);
  const currentYear = Number(today.slice(0, 4));
  if (year > currentYear) throw futureReference();
  const start = `${reference}-01-01`;
  // Ano corrente: termina no início do mês seguinte ao atual. Anos anteriores: doze meses.
  const endExclusive =
    year === currentYear
      ? firstOfMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)) + 1)
      : `${year + 1}-01-01`;
  const months = monthsBetween(start, endExclusive);
  return {
    type,
    reference,
    start,
    endExclusive,
    previousStart: firstOfMonth(year, 1 - months),
    previousEndExclusive: start,
  };
}

function formatFor(type: AnalyticsPeriodType): string {
  if (type === 'week') return 'YYYY-MM-DD';
  if (type === 'month') return 'YYYY-MM';
  return 'YYYY';
}
