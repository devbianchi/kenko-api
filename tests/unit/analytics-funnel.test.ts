import { describe, expect, it } from 'vitest';
import { buildEndings, buildFunnel } from '../../src/services/analytics-funnel';

describe('funil e términos de Analytics', () => {
  it('calcula cada marco como percentual dos que iniciaram, sem arredondar', () => {
    expect(
      buildFunnel({
        started: 8,
        answeredSpecialty: 7,
        receivedSlotResult: 6,
        selectedSlot: 5,
        confirmed: 4,
      }),
    ).toEqual([
      { stage: 'started_scheduling', count: 8, percentage: 100 },
      { stage: 'answered_specialty', count: 7, percentage: 87.5 },
      { stage: 'received_slot_result', count: 6, percentage: 75 },
      { stage: 'selected_slot', count: 5, percentage: 62.5 },
      { stage: 'confirmed', count: 4, percentage: 50 },
    ]);
  });

  it('devolve percentuais null quando ninguém iniciou', () => {
    const funil = buildFunnel({
      started: 0,
      answeredSpecialty: 0,
      receivedSlotResult: 0,
      selectedSlot: 0,
      confirmed: 0,
    });
    expect(funil.every((linha) => linha.percentage === null)).toBe(true);
  });

  it('mostra as quatro etapas de término sempre, com zero onde não houve saída nem abandono', () => {
    expect(buildEndings([{ stage: 'patient_data', exited: 0, abandoned: 2 }])).toEqual([
      { stage: 'triage', exited: 0, abandoned: 0 },
      { stage: 'slot_selection', exited: 0, abandoned: 0 },
      { stage: 'patient_data', exited: 0, abandoned: 2 },
      { stage: 'confirmation', exited: 0, abandoned: 0 },
    ]);
  });
});
