import { describe, expect, it } from 'vitest';
import { toBusinessIso } from '../../src/shared/business-time';

describe('toBusinessIso', () => {
  it('formata o instante com o deslocamento de America/Sao_Paulo', () => {
    expect(toBusinessIso(new Date('2026-11-10T15:00:00Z'))).toBe('2026-11-10T12:00:00-03:00');
  });

  it('mantém a data local quando o instante cai em outro dia em UTC', () => {
    expect(toBusinessIso(new Date('2026-11-11T01:30:00Z'))).toBe('2026-11-10T22:30:00-03:00');
  });
});
