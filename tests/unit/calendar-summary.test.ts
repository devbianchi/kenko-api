import { describe, expect, it } from 'vitest';
import {
  type DayAppointment,
  occupancyPercentage,
  peakHour,
  summarizeDay,
} from '../../src/services/calendar-summary';

const AGORA = new Date('2026-11-10T15:15:00Z'); // 12:15 em Brasília

const consulta = (
  hora: number,
  fim: string,
  canceladaEm: string | null = null,
  salaId = 1,
): DayAppointment => ({
  salaId,
  hora,
  canceladaEm: canceladaEm === null ? null : new Date(canceladaEm),
  fim: new Date(fim),
});

describe('summarizeDay (RF-13, MET-D)', () => {
  it('separa completas, pendentes e canceladas, e conta as canceladas no total', () => {
    const dia = summarizeDay(
      [
        consulta(9, '2026-11-10T11:30:00-03:00'), // já terminou: completa
        consulta(10, '2026-11-10T13:00:00-03:00', '2026-11-10T11:00:00-03:00'), // cancelada
        consulta(13, '2026-11-10T13:30:00-03:00'), // ainda não terminou: pendente
      ],
      AGORA,
    );
    expect(dia).toMatchObject({ total: 3, complete: 1, pending: 1, cancelled: 1 });
    expect(dia.completionPercentage).toBeCloseTo(100 / 3, 10);
  });

  it('uma consulta cancelada não vira completa, mesmo depois do fim do horário', () => {
    const dia = summarizeDay(
      [consulta(9, '2026-11-10T12:30:00-03:00', '2026-11-10T08:00:00-03:00')],
      AGORA,
    );
    expect(dia).toMatchObject({ complete: 0, cancelled: 1 });
  });

  it('deixa a conclusão sem valor quando o dia não tem consultas', () => {
    expect(summarizeDay([], AGORA).completionPercentage).toBeNull();
  });

  it('conta as 24 horas do dia, mesmo as sem consultas', () => {
    const dia = summarizeDay([consulta(9, '2026-11-10T12:30:00-03:00')], AGORA);
    expect(dia.appointmentsByHour.hours).toHaveLength(24);
    expect(dia.appointmentsByHour.counts).toHaveLength(24);
    expect(dia.appointmentsByHour.counts[9]).toBe(1);
    expect(dia.appointmentsByHour.counts.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('corta manhã e tarde às 12h: 11h59 é manhã, 12h é tarde', () => {
    const dia = summarizeDay(
      [
        consulta(11, '2026-11-10T12:00:00-03:00'),
        consulta(12, '2026-11-10T13:00:00-03:00'),
        consulta(15, '2026-11-10T16:00:00-03:00'),
      ],
      AGORA,
    );
    expect(dia.appointmentsByDayPeriod).toEqual({ morning: 1, afternoon: 2 });
  });
});

describe('peakHour (desempate pela hora mais cedo)', () => {
  it('devolve a hora com mais consultas, contando canceladas', () => {
    expect(
      peakHour([
        consulta(9, '2026-11-10T12:30:00-03:00'),
        consulta(14, '2026-11-10T15:00:00-03:00', '2026-11-10T08:00:00-03:00'),
        consulta(14, '2026-11-10T15:30:00-03:00'),
      ]),
    ).toBe(14);
  });

  it('em empate, fica com a hora mais cedo', () => {
    expect(
      peakHour([
        consulta(13, '2026-11-10T14:00:00-03:00'),
        consulta(9, '2026-11-10T12:30:00-03:00'),
      ]),
    ).toBe(9);
  });

  it('sem consultas, não há pico', () => {
    expect(peakHour([])).toBeNull();
  });
});

describe('occupancyPercentage (ocupação por contagem, sem capacidade é null)', () => {
  it('calcula 100 × ocupados ÷ totais, sem arredondar', () => {
    expect(occupancyPercentage(1, 3)).toBeCloseTo(100 / 3, 10);
    expect(occupancyPercentage(2, 4)).toBe(50);
  });

  it('sem horários cadastrados na data, a ocupação é null', () => {
    expect(occupancyPercentage(0, 0)).toBeNull();
  });
});
