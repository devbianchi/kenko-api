import { createHash } from 'node:crypto';

/** JSON com as chaves ordenadas, para que o mesmo conteúdo sempre gere o mesmo texto. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const chaves = Object.keys(value).sort();
    const partes = chaves.map(
      (chave) =>
        `${JSON.stringify(chave)}:${stableStringify((value as Record<string, unknown>)[chave])}`,
    );
    return `{${partes.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 do input normalizado, usado para reconhecer a mesma ação reenviada (ADR-0006). */
export function hashInput(input: unknown): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex');
}
