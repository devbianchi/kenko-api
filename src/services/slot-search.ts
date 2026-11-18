import { toBusinessIso } from '../shared/business-time';

/** Horário elegível para oferta: livre, futuro e compatível com a especialidade. */
export interface SlotCandidate {
  id: number;
  inicio: Date;
}

/**
 * Escolhe até três horários (RF-02): até dois dias distintos da semana atual, cada um no horário
 * mais próximo daquele dia, e o mais próximo da próxima semana. A semana atual termina antes de
 * `inicioProximaSemana`. Os candidatos devem vir ordenados por início e identificador.
 * Não completa posições faltantes com horários fora dessa distribuição (VAL-31).
 */
export function selectOffers(
  candidates: SlotCandidate[],
  inicioProximaSemana: Date,
): SlotCandidate[] {
  const semanaAtual = candidates.filter((c) => c.inicio.getTime() < inicioProximaSemana.getTime());
  const proximaSemana = candidates.filter(
    (c) => c.inicio.getTime() >= inicioProximaSemana.getTime(),
  );

  const primeiroDeCadaDia = new Map<string, SlotCandidate>();
  for (const candidate of semanaAtual) {
    const dia = toBusinessIso(candidate.inicio).slice(0, 10);
    if (!primeiroDeCadaDia.has(dia)) primeiroDeCadaDia.set(dia, candidate);
  }
  const doisDias = [...primeiroDeCadaDia.values()].slice(0, 2);
  const umDaProxima = proximaSemana.slice(0, 1);

  return [...doisDias, ...umDaProxima].sort(
    (a, b) => a.inicio.getTime() - b.inicio.getTime() || a.id - b.id,
  );
}

/**
 * Início da semana (domingo, 00h de Brasília) que contém `agora`, e da semana seguinte.
 * A semana vai de domingo a sábado no fuso de negócio (RF-02).
 */
export function weekBounds(agora: Date): { inicioSemanaAtual: Date; inicioProximaSemana: Date } {
  const dia = toBusinessIso(agora).slice(0, 10);
  const diaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  const domingo = new Date(`${dia}T12:00:00Z`);
  domingo.setUTCDate(domingo.getUTCDate() - diaSemana);
  const dataDomingo = domingo.toISOString().slice(0, 10);

  const proximoDomingo = new Date(`${dataDomingo}T12:00:00Z`);
  proximoDomingo.setUTCDate(proximoDomingo.getUTCDate() + 7);
  const dataProximoDomingo = proximoDomingo.toISOString().slice(0, 10);

  return {
    inicioSemanaAtual: new Date(`${dataDomingo}T00:00:00-03:00`),
    inicioProximaSemana: new Date(`${dataProximoDomingo}T00:00:00-03:00`),
  };
}
