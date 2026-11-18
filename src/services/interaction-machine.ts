import { AppError } from '../errors/app-error';
import type { InteractionInput } from '../schemas/interaction.schema';

export type TipoVisita = 'primeira_consulta' | 'retorno';

/** Efeito que uma ação aceita produz além de mudar o passo. */
export type Effect =
  | { type: 'start_attempt' }
  | { type: 'answer_specialty'; especialidadeId: number }
  | { type: 'answer_visit_kind'; tipoVisita: TipoVisita }
  | { type: 'exit' };

export interface Transition {
  nextStep: string;
  effects: Effect[];
}

export interface MachineContext {
  /** Identificadores internos das especialidades da clínica, na ordem em que aparecem na tela. */
  specialtyIds: number[];
}

/** Opções do menu que ainda não têm fluxo nesta fase. */
const OPCOES_AINDA_NAO_DISPONIVEIS = new Set(['opt_clinic_info', 'opt_appointments']);

function naoPermitido(): AppError {
  return new AppError('ACTION_NOT_ALLOWED_IN_STEP', 'Esta ação não é permitida neste passo.');
}

function opcaoInvalida(): AppError {
  return new AppError('INVALID_OPTION', 'Opção indisponível neste passo.', {
    optionId: 'Opção indisponível neste passo.',
  });
}

/** Lê o id interno de uma opção de especialidade, no formato sp_<id>. */
function especialidadeDaOpcao(optionId: string, ctx: MachineContext): number | null {
  const match = /^sp_([1-9][0-9]*)$/.exec(optionId);
  if (!match) return null;
  const id = Number(match[1]);
  return ctx.specialtyIds.includes(id) ? id : null;
}

/**
 * Máquina de estados do roteiro. Função pura: recebe o passo atual e a entrada, e devolve o passo
 * seguinte e os efeitos, ou lança o erro do catálogo. Não toca no banco.
 */
export function transition(step: string, input: InteractionInput, ctx: MachineContext): Transition {
  // Sair vale em qualquer passo ativo (RN-11).
  if (input.type === 'exit') {
    return { nextStep: 'closed', effects: [{ type: 'exit' }] };
  }

  switch (step) {
    case 'menu': {
      if (input.type !== 'select_option') throw naoPermitido();
      if (input.optionId === 'opt_schedule') {
        return { nextStep: 'specialty', effects: [{ type: 'start_attempt' }] };
      }
      if (OPCOES_AINDA_NAO_DISPONIVEIS.has(input.optionId)) {
        throw new AppError('ACTION_NOT_ALLOWED_IN_STEP', 'Esta opção ainda não está disponível.');
      }
      throw opcaoInvalida();
    }

    case 'specialty': {
      if (input.type !== 'select_option') throw naoPermitido();
      const especialidadeId = especialidadeDaOpcao(input.optionId, ctx);
      if (especialidadeId === null) throw opcaoInvalida();
      return {
        nextStep: 'visit_kind',
        effects: [{ type: 'answer_specialty', especialidadeId }],
      };
    }

    case 'visit_kind': {
      if (input.type !== 'select_option') throw naoPermitido();
      if (input.optionId === 'opt_first_visit') {
        return {
          nextStep: 'slot_selection',
          effects: [{ type: 'answer_visit_kind', tipoVisita: 'primeira_consulta' }],
        };
      }
      if (input.optionId === 'opt_return') {
        return {
          nextStep: 'slot_selection',
          effects: [{ type: 'answer_visit_kind', tipoVisita: 'retorno' }],
        };
      }
      throw opcaoInvalida();
    }

    case 'slot_selection': {
      // Os horários oferecidos nesta tentativa chegam na fase 5c. Até lá nenhum horário foi oferecido,
      // então qualquer escolha de horário é recusada.
      if (input.type === 'select_slot') {
        throw new AppError('INVALID_SLOT', 'Horário não oferecido nesta tentativa.', {
          slotId: 'Horário não oferecido nesta tentativa.',
        });
      }
      throw naoPermitido();
    }

    default:
      throw naoPermitido();
  }
}
