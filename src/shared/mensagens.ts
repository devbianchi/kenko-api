import { toBusinessIso } from './business-time';

/** Substitui {chave} pelo valor. Chave sem valor fica como está, para não esconder um erro de texto. */
export function renderizarTexto(texto: string, variaveis: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (trecho, chave: string) => variaveis[chave] ?? trecho);
}

/** Data no formato do contrato: 11/11. */
export function formatarData(instante: Date): string {
  const [, mes, dia] = toBusinessIso(instante).slice(0, 10).split('-');
  return `${dia}/${mes}`;
}

/** Hora no formato do contrato: 09h, ou 09h30 quando há minutos. */
export function formatarHora(instante: Date): string {
  const [hora, minuto] = toBusinessIso(instante).slice(11, 16).split(':');
  return minuto === '00' ? `${hora}h` : `${hora}h${minuto}`;
}
