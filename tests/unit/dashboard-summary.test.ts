import { describe, expect, it } from 'vitest';
import { median, summarizePeakHour } from '../../src/services/dashboard-summary';

describe('resumo do dashboard', () => {
  it('calcula a mediana e a média dos dois valores centrais quando N é par', () => {
    expect(median([90, 10, 40])).toBe(40);
    expect(median([90, 10, 40, 20])).toBe(30);
    expect(median([])).toBeNull();
  });

  it('usa zeros nos horários de expediente sem consulta e desempata pela hora mais cedo', () => {
    expect(
      summarizePeakHour(
        [7, 8, 9, 10],
        [
          { hour: 9, appointmentCount: 3 },
          { hour: 10, appointmentCount: 3 },
          { hour: 21, appointmentCount: 100 },
        ],
      ),
    ).toEqual({
      hour: 9,
      appointmentCount: 3,
      otherBusinessHoursAverage: 1,
      aboveAverage: 2,
    });
  });

  it('retorna nulo sem horários de expediente', () => {
    expect(summarizePeakHour([], [])).toBeNull();
  });
});
