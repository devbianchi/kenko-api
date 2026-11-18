import { describe, expect, it } from 'vitest';
import type { DaySchedule } from '../../src/models/clinic.model';
import { groupOpeningHours, isWithinOpeningHours } from '../../src/services/opening-hours';

const expedienteBasico: DaySchedule[] = [
  { weekday: 0, opensAt: null, closesAt: null },
  { weekday: 1, opensAt: '07:00:00', closesAt: '18:00:00' },
  { weekday: 2, opensAt: '07:00:00', closesAt: '18:00:00' },
  { weekday: 3, opensAt: '07:00:00', closesAt: '18:00:00' },
  { weekday: 4, opensAt: '07:00:00', closesAt: '18:00:00' },
  { weekday: 5, opensAt: '07:00:00', closesAt: '18:00:00' },
  { weekday: 6, opensAt: '09:00:00', closesAt: '13:00:00' },
];

describe('groupOpeningHours', () => {
  it('agrupa segunda a sexta, sábado e domingo fechado como no contrato', () => {
    expect(groupOpeningHours(expedienteBasico)).toEqual([
      { weekdays: [1, 2, 3, 4, 5], opensAt: '07:00', closesAt: '18:00' },
      { weekdays: [6], opensAt: '09:00', closesAt: '13:00' },
      { weekdays: [0], closed: true },
    ]);
  });

  it('agrupa dias fechados consecutivos, como sábado e domingo', () => {
    const dias: DaySchedule[] = [
      { weekday: 1, opensAt: '08:00:00', closesAt: '12:00:00' },
      { weekday: 6, opensAt: null, closesAt: null },
      { weekday: 0, opensAt: null, closesAt: null },
    ];
    expect(groupOpeningHours(dias)).toEqual([
      { weekdays: [1], opensAt: '08:00', closesAt: '12:00' },
      { weekdays: [6, 0], closed: true },
    ]);
  });

  it('separa dias com horários diferentes mesmo que sejam consecutivos', () => {
    const dias: DaySchedule[] = [
      { weekday: 1, opensAt: '07:00:00', closesAt: '18:00:00' },
      { weekday: 2, opensAt: '08:00:00', closesAt: '18:00:00' },
    ];
    expect(groupOpeningHours(dias)).toEqual([
      { weekdays: [1], opensAt: '07:00', closesAt: '18:00' },
      { weekdays: [2], opensAt: '08:00', closesAt: '18:00' },
    ]);
  });

  it('não agrupa dias separados por um dia sem registro', () => {
    const dias: DaySchedule[] = [
      { weekday: 1, opensAt: '07:00:00', closesAt: '18:00:00' },
      { weekday: 3, opensAt: '07:00:00', closesAt: '18:00:00' },
    ];
    expect(groupOpeningHours(dias)).toEqual([
      { weekdays: [1], opensAt: '07:00', closesAt: '18:00' },
      { weekdays: [3], opensAt: '07:00', closesAt: '18:00' },
    ]);
  });

  it('devolve lista vazia quando não há expediente cadastrado', () => {
    expect(groupOpeningHours([])).toEqual([]);
  });
});

describe('isWithinOpeningHours (VAL-34)', () => {
  it('considera aberta na abertura e fechada no fechamento, em dia útil', () => {
    expect(isWithinOpeningHours(expedienteBasico, 1, '07:00')).toBe(true);
    expect(isWithinOpeningHours(expedienteBasico, 1, '06:59')).toBe(false);
    expect(isWithinOpeningHours(expedienteBasico, 1, '17:59')).toBe(true);
    expect(isWithinOpeningHours(expedienteBasico, 1, '18:00')).toBe(false);
  });

  it('considera o sábado com horário próprio', () => {
    expect(isWithinOpeningHours(expedienteBasico, 6, '09:00')).toBe(true);
    expect(isWithinOpeningHours(expedienteBasico, 6, '13:00')).toBe(false);
  });

  it('considera o domingo sempre fechado', () => {
    expect(isWithinOpeningHours(expedienteBasico, 0, '10:00')).toBe(false);
  });
});
