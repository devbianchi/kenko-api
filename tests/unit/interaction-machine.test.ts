import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/app-error';
import type { InteractionInput } from '../../src/schemas/interaction.schema';
import { type MachineContext, transition } from '../../src/services/interaction-machine';

const ctx: MachineContext = {
  specialtyIds: [1, 2, 3, 4],
  offeredSlotIds: [],
  hasPatient: false,
  hojeLocal: '2026-11-10',
};
const opcao = (optionId: string): InteractionInput => ({ type: 'select_option', optionId });
const paciente = (name: string, birthDate: string): InteractionInput => ({
  type: 'submit_patient',
  patient: { name, birthDate },
});

function erro(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  throw new Error('esperava erro');
}

describe('máquina de estados do roteiro', () => {
  it('avança do menu para a especialidade e inicia a tentativa', () => {
    expect(transition('menu', opcao('opt_schedule'), ctx)).toEqual({
      nextStep: 'specialty',
      effects: [{ type: 'start_attempt' }],
    });
  });

  it('registra a especialidade escolhida e pergunta a visita', () => {
    expect(transition('specialty', opcao('sp_2'), ctx)).toEqual({
      nextStep: 'visit_kind',
      effects: [{ type: 'answer_specialty', especialidadeId: 2 }],
    });
  });

  it('registra a visita e dispara a busca de horários', () => {
    expect(transition('visit_kind', opcao('opt_first_visit'), ctx)).toEqual({
      nextStep: 'slot_selection',
      effects: [
        { type: 'answer_visit_kind', tipoVisita: 'primeira_consulta' },
        { type: 'search_slots' },
      ],
    });
    expect(transition('visit_kind', opcao('opt_return'), ctx).effects[0]).toEqual({
      type: 'answer_visit_kind',
      tipoVisita: 'retorno',
    });
  });

  it('pede nome e nascimento depois de escolher o horário, sem paciente ainda', () => {
    const comOferta = { ...ctx, offeredSlotIds: [501] };
    expect(
      transition('slot_selection', { type: 'select_slot', slotId: 'slot_501' }, comOferta),
    ).toEqual({
      nextStep: 'patient_data',
      effects: [{ type: 'select_slot', horarioId: 501 }],
    });
  });

  it('confirma direto na escolha quando a conversa já tem paciente (VAL-41)', () => {
    const comOfertaEPaciente = { ...ctx, offeredSlotIds: [501], hasPatient: true };
    expect(
      transition('slot_selection', { type: 'select_slot', slotId: 'slot_501' }, comOfertaEPaciente),
    ).toEqual({
      nextStep: 'menu',
      effects: [
        { type: 'select_slot', horarioId: 501 },
        { type: 'confirm_appointment', paciente: null },
      ],
    });
  });

  it('confirma com o paciente informado, com nome sem espaços nas extremidades', () => {
    expect(transition('patient_data', paciente('  Ana Silva ', '1998-04-15'), ctx)).toEqual({
      nextStep: 'menu',
      effects: [
        { type: 'confirm_appointment', paciente: { name: 'Ana Silva', birthDate: '1998-04-15' } },
      ],
    });
  });

  it('recusa nome vazio ou com mais de 100 caracteres (INVALID_NAME)', () => {
    expect(erro(() => transition('patient_data', paciente('   ', '1998-04-15'), ctx))).toBe(
      'INVALID_NAME',
    );
    expect(
      erro(() => transition('patient_data', paciente('x'.repeat(101), '1998-04-15'), ctx)),
    ).toBe('INVALID_NAME');
  });

  it('recusa nascimento futuro ou inválido (INVALID_BIRTH_DATE)', () => {
    expect(erro(() => transition('patient_data', paciente('Ana', '2026-11-11'), ctx))).toBe(
      'INVALID_BIRTH_DATE',
    );
    expect(erro(() => transition('patient_data', paciente('Ana', '2026-02-30'), ctx))).toBe(
      'INVALID_BIRTH_DATE',
    );
    expect(erro(() => transition('patient_data', paciente('Ana', 'ontem'), ctx))).toBe(
      'INVALID_BIRTH_DATE',
    );
  });

  it('aceita nascimento de hoje', () => {
    expect(transition('patient_data', paciente('Ana', '2026-11-10'), ctx).nextStep).toBe('menu');
  });

  it('recusa horário que não foi oferecido na tentativa (INVALID_SLOT)', () => {
    const comOferta = { ...ctx, offeredSlotIds: [501] };
    expect(
      erro(() =>
        transition('slot_selection', { type: 'select_slot', slotId: 'slot_999' }, comOferta),
      ),
    ).toBe('INVALID_SLOT');
    expect(
      erro(() => transition('slot_selection', { type: 'select_slot', slotId: 'xyz' }, comOferta)),
    ).toBe('INVALID_SLOT');
  });

  it('volta ao menu pela ação de continuar, sem nova busca', () => {
    expect(transition('continue_after_no_slots', opcao('opt_continue'), ctx)).toEqual({
      nextStep: 'menu',
      effects: [],
    });
  });

  it('recusa com INVALID_OPTION uma opção que não pertence ao passo', () => {
    expect(erro(() => transition('specialty', opcao('sp_99'), ctx))).toBe('INVALID_OPTION');
    expect(erro(() => transition('menu', opcao('opt_inventada'), ctx))).toBe('INVALID_OPTION');
  });

  it('recusa com ACTION_NOT_ALLOWED_IN_STEP uma ação que o passo não aceita', () => {
    expect(erro(() => transition('menu', paciente('Ana', '1998-04-15'), ctx))).toBe(
      'ACTION_NOT_ALLOWED_IN_STEP',
    );
    expect(
      erro(() => transition('specialty', { type: 'select_slot', slotId: 'slot_1' }, ctx)),
    ).toBe('ACTION_NOT_ALLOWED_IN_STEP');
  });

  it('encerra com Sair em qualquer passo ativo', () => {
    for (const step of ['menu', 'specialty', 'visit_kind', 'slot_selection', 'patient_data']) {
      expect(transition(step, { type: 'exit' }, ctx)).toEqual({
        nextStep: 'closed',
        effects: [{ type: 'exit' }],
      });
    }
  });

  it('ainda não abre clínica e reservas pelo menu (fase 5e)', () => {
    expect(erro(() => transition('menu', opcao('opt_clinic_info'), ctx))).toBe(
      'ACTION_NOT_ALLOWED_IN_STEP',
    );
    expect(erro(() => transition('menu', opcao('opt_appointments'), ctx))).toBe(
      'ACTION_NOT_ALLOWED_IN_STEP',
    );
  });
});
