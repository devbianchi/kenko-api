import { describe, expect, it } from 'vitest';
import { selectOffers, weekBounds, type SlotCandidate } from '../../src/services/slot-search';

const INICIO_PROXIMA = new Date('2026-11-15T00:00:00-03:00'); // domingo seguinte a 10/11/2026

const h = (id: number, iso: string): SlotCandidate => ({ id, inicio: new Date(iso) });

describe('selectOffers (RF-02, VAL-04 e VAL-31)', () => {
  it('oferece dois dias distintos da semana atual e o mais próximo da seguinte, em ordem', () => {
    const candidatos = [
      h(1, '2026-11-11T09:00:00-03:00'),
      h(2, '2026-11-11T10:00:00-03:00'),
      h(3, '2026-11-12T14:00:00-03:00'),
      h(4, '2026-11-14T09:00:00-03:00'),
      h(5, '2026-11-16T07:00:00-03:00'),
      h(6, '2026-11-17T07:00:00-03:00'),
    ];
    expect(selectOffers(candidatos, INICIO_PROXIMA).map((c) => c.id)).toEqual([1, 3, 5]);
  });

  it('usa só o horário mais cedo de cada dia, sem dois horários do mesmo dia', () => {
    const candidatos = [h(1, '2026-11-11T09:00:00-03:00'), h(2, '2026-11-11T15:00:00-03:00')];
    expect(selectOffers(candidatos, INICIO_PROXIMA).map((c) => c.id)).toEqual([1]);
  });

  it('mostra menos de três opções quando faltam dias, sem completar fora da distribuição (VAL-31)', () => {
    const candidatos = [h(1, '2026-11-11T09:00:00-03:00'), h(2, '2026-11-11T15:00:00-03:00')];
    // Só há um dia na semana atual e nada na seguinte: a oferta fica com uma opção.
    expect(selectOffers(candidatos, INICIO_PROXIMA).map((c) => c.id)).toEqual([1]);
  });

  it('devolve lista vazia quando não há candidatos', () => {
    expect(selectOffers([], INICIO_PROXIMA)).toEqual([]);
  });

  it('considera o horário de um dia da próxima semana como a opção da semana seguinte', () => {
    const candidatos = [h(1, '2026-11-16T07:00:00-03:00'), h(2, '2026-11-17T07:00:00-03:00')];
    expect(selectOffers(candidatos, INICIO_PROXIMA).map((c) => c.id)).toEqual([1]);
  });
});

describe('weekBounds', () => {
  it('acha o domingo anterior e o domingo seguinte para uma terça-feira', () => {
    const { inicioSemanaAtual, inicioProximaSemana } = weekBounds(new Date('2026-11-10T15:00:00Z'));
    expect(inicioSemanaAtual.toISOString()).toBe('2026-11-08T03:00:00.000Z');
    expect(inicioProximaSemana.toISOString()).toBe('2026-11-15T03:00:00.000Z');
  });

  it('considera o domingo como início da própria semana', () => {
    const { inicioSemanaAtual } = weekBounds(new Date('2026-11-08T15:00:00Z'));
    expect(inicioSemanaAtual.toISOString()).toBe('2026-11-08T03:00:00.000Z');
  });

  it('considera o sábado à noite ainda na semana que começou no domingo', () => {
    // 14/11 às 23h em Brasília ainda é sábado; a semana seguinte começa em 15/11.
    const { inicioSemanaAtual, inicioProximaSemana } = weekBounds(new Date('2026-11-15T02:00:00Z'));
    expect(inicioSemanaAtual.toISOString()).toBe('2026-11-08T03:00:00.000Z');
    expect(inicioProximaSemana.toISOString()).toBe('2026-11-15T03:00:00.000Z');
  });
});
