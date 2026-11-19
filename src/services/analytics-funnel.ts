import { percentage } from './analytics-kpis';

/** Marcos do funil, contados por conversa distinta dentro da coorte que iniciou o agendamento. */
export interface FunnelFacts {
  started: number;
  answeredSpecialty: number;
  receivedSlotResult: number;
  selectedSlot: number;
  confirmed: number;
}

/** Etapas do roteiro exibidas nas barras de término. O menu fica de fora (MET-A07). */
export const ENDING_STAGES = ['triage', 'slot_selection', 'patient_data', 'confirmation'] as const;

export interface EndingRow {
  stage: string;
  exited: number;
  abandoned: number;
}

/** Funil de conversão. Cada linha é um percentual da base "iniciaram". Sem base, o percentual é null. */
export function buildFunnel(facts: FunnelFacts) {
  const rows: Array<[string, number]> = [
    ['started_scheduling', facts.started],
    ['answered_specialty', facts.answeredSpecialty],
    ['received_slot_result', facts.receivedSlotResult],
    ['selected_slot', facts.selectedSlot],
    ['confirmed', facts.confirmed],
  ];
  return rows.map(([stage, count]) => ({
    stage,
    count,
    percentage: percentage(count, facts.started),
  }));
}

/** Uma linha por etapa de término, sempre as quatro, com zero onde não houve saída nem abandono. */
export function buildEndings(rows: EndingRow[]) {
  return ENDING_STAGES.map((stage) => {
    const found = rows.find((row) => row.stage === stage);
    return { stage, exited: found?.exited ?? 0, abandoned: found?.abandoned ?? 0 };
  });
}
