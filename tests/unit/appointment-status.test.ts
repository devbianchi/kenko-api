import { describe, expect, it } from 'vitest';
import { appointmentStatus, canCancel } from '../../src/services/appointment-status';

const FIM = new Date('2026-11-10T12:30:00-03:00');

describe('status das consultas (contrato, status das consultas)', () => {
  it('considera completa no instante exato do fim do horário (VAL-17)', () => {
    expect(appointmentStatus({ canceladaEm: null, fim: FIM }, FIM)).toBe('complete');
  });

  it('considera pendente um milissegundo antes do fim do horário (VAL-17)', () => {
    expect(appointmentStatus({ canceladaEm: null, fim: FIM }, new Date(FIM.getTime() - 1))).toBe(
      'pending',
    );
  });

  it('mantém cancelada uma consulta cancelada depois do fim, pois cancelamento prevalece sobre o tempo (VAL-16)', () => {
    const depois = new Date(FIM.getTime() + 60 * 60 * 1000);
    expect(
      appointmentStatus({ canceladaEm: new Date('2026-11-10T11:00:00-03:00'), fim: FIM }, depois),
    ).toBe('cancelled');
  });

  it('só permite cancelar pendente em conversa ativa', () => {
    expect(canCancel('pending', true)).toBe(true);
    expect(canCancel('complete', true)).toBe(false);
    expect(canCancel('cancelled', true)).toBe(false);
    expect(canCancel('pending', false)).toBe(false);
  });
});
