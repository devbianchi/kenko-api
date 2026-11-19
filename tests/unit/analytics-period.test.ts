import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/app-error';
import { resolveAnalyticsPeriod } from '../../src/services/analytics-period';

const HOJE = '2026-11-10'; // terça-feira, 12:15 em Brasília

describe('período de Analytics', () => {
  it('resolve semana como sete dias terminando na data informada, com a semana anterior', () => {
    expect(resolveAnalyticsPeriod('week', '2026-11-10', HOJE)).toEqual({
      type: 'week',
      reference: '2026-11-10',
      start: '2026-11-04',
      endExclusive: '2026-11-11',
      previousStart: '2026-10-28',
      previousEndExclusive: '2026-11-04',
    });
  });

  it('resolve mês fechado com o mesmo número de dias do período anterior', () => {
    expect(resolveAnalyticsPeriod('month', '2026-10', HOJE)).toMatchObject({
      start: '2026-10-01',
      endExclusive: '2026-11-01',
      previousStart: '2026-08-31',
      previousEndExclusive: '2026-10-01',
    });
  });

  it('resolve o mês corrente até o início do mês seguinte', () => {
    expect(resolveAnalyticsPeriod('month', '2026-11', HOJE)).toMatchObject({
      start: '2026-11-01',
      endExclusive: '2026-12-01',
    });
  });

  it('resolve o ano corrente até o início do mês seguinte ao atual, com onze meses anteriores', () => {
    expect(resolveAnalyticsPeriod('year', '2026', HOJE)).toMatchObject({
      start: '2026-01-01',
      endExclusive: '2026-12-01',
      previousStart: '2025-02-01',
      previousEndExclusive: '2026-01-01',
    });
  });

  it('resolve ano anterior como doze meses e compara com o ano inteiro antes dele', () => {
    expect(resolveAnalyticsPeriod('year', '2025', HOJE)).toMatchObject({
      start: '2025-01-01',
      endExclusive: '2026-01-01',
      previousStart: '2024-01-01',
      previousEndExclusive: '2025-01-01',
    });
  });

  it('aceita a data de hoje e o mês atual como referências válidas', () => {
    expect(() => resolveAnalyticsPeriod('week', HOJE, HOJE)).not.toThrow();
    expect(() => resolveAnalyticsPeriod('month', '2026-11', HOJE)).not.toThrow();
    expect(() => resolveAnalyticsPeriod('year', '2026', HOJE)).not.toThrow();
  });

  it.each([
    ['week', '2026-11-11', 'FUTURE_PERIOD'],
    ['month', '2026-12', 'FUTURE_PERIOD'],
    ['year', '2027', 'FUTURE_PERIOD'],
    ['week', '2026-02-30', 'INVALID_PERIOD'],
    ['week', '2026-11', 'INVALID_PERIOD'],
    ['month', '2026-13', 'INVALID_PERIOD'],
    ['month', '2026-1', 'INVALID_PERIOD'],
    ['year', '0000', 'INVALID_PERIOD'],
    ['year', '26', 'INVALID_PERIOD'],
  ])('rejeita %s com referência %s como %s', (period, reference, code) => {
    expect(() => resolveAnalyticsPeriod(period, reference, HOJE)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('rejeita tipo de período fora de week, month e year', () => {
    const erro = (() => {
      try {
        resolveAnalyticsPeriod('day', '2026-11-10', HOJE);
      } catch (caught) {
        return caught;
      }
    })();
    expect(erro).toBeInstanceOf(AppError);
    expect(erro).toMatchObject({ code: 'INVALID_PERIOD', status: 400 });
  });

  it('pede period e reference quando ausentes', () => {
    expect(() => resolveAnalyticsPeriod(undefined, '2026-10', HOJE)).toThrowError(
      expect.objectContaining({ code: 'MISSING_PARAMETER' }),
    );
    expect(() => resolveAnalyticsPeriod('month', undefined, HOJE)).toThrowError(
      expect.objectContaining({ code: 'MISSING_PARAMETER' }),
    );
  });
});
