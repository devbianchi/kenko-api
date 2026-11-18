import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/app-error';
import type { InteractionInput } from '../../src/schemas/interaction.schema';
import { transition } from '../../src/services/interaction-machine';

const ctx = { specialtyIds: [1, 2, 3, 4], offeredSlotIds: [] as number[] };
const opcao = (optionId: string): InteractionInput => ({ type: 'select_option', optionId });

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

  it('registra primeira consulta e retorno, e dispara a busca de horários', () => {
    expect(transition('visit_kind', opcao('opt_first_visit'), ctx)).toEqual({
      nextStep: 'slot_selection',
      effects: [
        { type: 'answer_visit_kind', tipoVisita: 'primeira_consulta' },
        { type: 'search_slots' },
      ],
    });
    expect(transition('visit_kind', opcao('opt_return'), ctx)).toEqual({
      nextStep: 'slot_selection',
      effects: [{ type: 'answer_visit_kind', tipoVisita: 'retorno' }, { type: 'search_slots' }],
    });
  });

  it('volta ao menu pela ação de continuar, sem nova busca', () => {
    expect(transition('continue_after_no_slots', opcao('opt_continue'), ctx)).toEqual({
      nextStep: 'menu',
      effects: [],
    });
  });

  it('recusa escolha de horário que não foi oferecido na tentativa (INVALID_SLOT)', () => {
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

  it('ainda não confirma a escolha de um horário oferecido (fase 5d)', () => {
    const comOferta = { ...ctx, offeredSlotIds: [501] };
    expect(
      erro(() =>
        transition('slot_selection', { type: 'select_slot', slotId: 'slot_501' }, comOferta),
      ),
    ).toBe('ACTION_NOT_ALLOWED_IN_STEP');
  });

  it('encerra com Sair em qualquer passo', () => {
    for (const step of ['menu', 'specialty', 'visit_kind', 'slot_selection']) {
      expect(transition(step, { type: 'exit' }, ctx)).toEqual({
        nextStep: 'closed',
        effects: [{ type: 'exit' }],
      });
    }
  });

  it('recusa opção de especialidade que não pertence à clínica (INVALID_OPTION)', () => {
    expect(erro(() => transition('specialty', opcao('sp_99'), ctx))).toBe('INVALID_OPTION');
    expect(erro(() => transition('specialty', opcao('opt_schedule'), ctx))).toBe('INVALID_OPTION');
  });

  it('recusa opção desconhecida no menu (INVALID_OPTION)', () => {
    expect(erro(() => transition('menu', opcao('opt_inventada'), ctx))).toBe('INVALID_OPTION');
  });

  it('recusa com ACTION_NOT_ALLOWED_IN_STEP uma ação que o passo não aceita', () => {
    const submit: InteractionInput = {
      type: 'submit_patient',
      patient: { name: 'Ana', birthDate: '1998-04-15' },
    };
    expect(erro(() => transition('menu', submit, ctx))).toBe('ACTION_NOT_ALLOWED_IN_STEP');
    expect(
      erro(() => transition('specialty', { type: 'select_slot', slotId: 'slot_1' }, ctx)),
    ).toBe('ACTION_NOT_ALLOWED_IN_STEP');
  });

  it('ainda não abre clínica e reservas pelo menu (fases 5e)', () => {
    expect(erro(() => transition('menu', opcao('opt_clinic_info'), ctx))).toBe(
      'ACTION_NOT_ALLOWED_IN_STEP',
    );
    expect(erro(() => transition('menu', opcao('opt_appointments'), ctx))).toBe(
      'ACTION_NOT_ALLOWED_IN_STEP',
    );
  });
});
