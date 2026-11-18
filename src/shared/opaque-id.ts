export type IdPrefix = 'clinic' | 'sp' | 'cv' | 'attempt' | 'slot' | 'apt';

/** Converte o id interno em identificador opaco da API, por exemplo cv_1. */
export function encodeId(prefix: IdPrefix, id: number): string {
  return `${prefix}_${id}`;
}

/** Devolve o id interno, ou null quando o valor não tem o prefixo esperado ou não é um número válido. */
export function decodeId(prefix: IdPrefix, value: string): number | null {
  const match = new RegExp(`^${prefix}_([1-9][0-9]*)$`).exec(value);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}
