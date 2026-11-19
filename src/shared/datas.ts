import { toBusinessIso } from './business-time';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Confere se a data existe no calendário (JavaScript aceitaria 30 de fevereiro sem reclamar). */
export function dataExiste(iso: string): boolean {
  if (!DATA_ISO.test(iso)) return false;
  const [ano, mes, dia] = iso.split('-').map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

/** Data de um instante no fuso de negócio, no formato AAAA-MM-DD. */
export function dataLocal(instante: Date): string {
  return toBusinessIso(instante).slice(0, 10);
}
