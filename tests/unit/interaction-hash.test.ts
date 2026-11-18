import { describe, expect, it } from 'vitest';
import { hashInput, stableStringify } from '../../src/services/interaction-hash';

describe('hashInput', () => {
  it('ignora a ordem das chaves, para que o mesmo conteúdo tenha o mesmo hash', () => {
    expect(hashInput({ type: 'select_option', optionId: 'opt_schedule' })).toBe(
      hashInput({ optionId: 'opt_schedule', type: 'select_option' }),
    );
  });

  it('muda quando o conteúdo muda', () => {
    expect(hashInput({ type: 'select_option', optionId: 'opt_schedule' })).not.toBe(
      hashInput({ type: 'select_option', optionId: 'opt_clinic_info' }),
    );
  });

  it('gera texto estável com chaves ordenadas em objetos aninhados', () => {
    expect(stableStringify({ b: { y: 1, x: [2, { d: 1, c: 2 }] }, a: null })).toBe(
      '{"a":null,"b":{"x":[2,{"c":2,"d":1}],"y":1}}',
    );
  });
});
