import { describe, expect, it } from 'vitest';
import { decodeId, encodeId } from '../../src/shared/opaque-id';

describe('identificadores opacos', () => {
  it('codifica o id interno com prefixo', () => {
    expect(encodeId('cv', 1)).toBe('cv_1');
    expect(encodeId('slot', 501)).toBe('slot_501');
  });

  it('decodifica o id quando o prefixo confere', () => {
    expect(decodeId('cv', 'cv_12')).toBe(12);
  });

  it('recusa prefixo errado, zero, negativo e texto malformado', () => {
    expect(decodeId('cv', 'slot_12')).toBeNull();
    expect(decodeId('cv', 'cv_0')).toBeNull();
    expect(decodeId('cv', 'cv_-1')).toBeNull();
    expect(decodeId('cv', 'cv_abc')).toBeNull();
    expect(decodeId('cv', 'cv_1x')).toBeNull();
  });
});
