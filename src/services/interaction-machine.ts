import { AppError } from '../errors/app-error';
import type { InteractionInput } from '../schemas/interaction.schema';
import { decodeId } from '../shared/opaque-id';

export type TipoVisita = 'primeira_consulta' | 'retorno';

export interface DadosPaciente {
  name: string;
  birthDate: string;
}

/** Efeito que uma ação aceita produz além de mudar o passo. */
export type Effect =
  | { type: 'start_attempt' }
  | { type: 'answer_specialty'; especialidadeId: number }
  | { type: 'answer_visit_kind'; tipoVisita: TipoVisita }
  | { type: 'search_slots' }
  | { type: 'select_slot'; horarioId: number }
  | { type: 'confirm_appointment'; paciente: DadosPaciente | null }
  | { type: 'cancel_appointment'; reservaId: number }
  | { type: 'exit' };

export interface Transition {
  nextStep: string;
  effects: Effect[];
}

export interface MachineContext {
  /** Identificadores internos das especialidades da clínica. */
  specialtyIds: number[];
  /** Horários já oferecidos na tentativa atual. */
  offeredSlotIds: number[];
  /** Se a conversa já tem paciente identificado. Uma nova reserva dispensa os dados de novo. */
  hasPatient: boolean;
  /** Data de hoje em Brasília, no formato AAAA-MM-DD. Não aceita nascimento depois dela. */
  hojeLocal: string;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Confere se a data existe no calendário (JavaScript aceitaria 30 de fevereiro sem reclamar). */
function dataExiste(iso: string): boolean {
  const [ano, mes, dia] = iso.split('-').map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

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
  const id = decodeId('sp', optionId);
  return id !== null && ctx.specialtyIds.includes(id) ? id : null;
}

function visitaDaOpcao(optionId: string): TipoVisita | null {
  if (optionId === 'opt_first_visit') return 'primeira_consulta';
  if (optionId === 'opt_return') return 'retorno';
  return null;
}

/** Valida nome e nascimento antes de qualquer gravação (RN-08). */
function validarPaciente(paciente: DadosPaciente, hojeLocal: string): DadosPaciente {
  const nome = paciente.name.trim();
  if (nome.length < 1 || nome.length > 100) {
    throw new AppError('INVALID_NAME', 'Nome obrigatório, com até 100 caracteres.', {
      'patient.name': 'Nome obrigatório, com até 100 caracteres.',
    });
  }

  const data = paciente.birthDate;
  const valida = DATA_ISO.test(data) && dataExiste(data) && data <= hojeLocal;
  if (!valida) {
    throw new AppError('INVALID_BIRTH_DATE', 'Data de nascimento inválida ou futura.', {
      'patient.birthDate': 'Data de nascimento inválida ou futura.',
    });
  }

  return { name: nome, birthDate: data };
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
      if (input.optionId === 'opt_clinic_info') {
        return { nextStep: 'clinic_information', effects: [] };
      }
      if (input.optionId === 'opt_appointments') {
        return { nextStep: 'appointments', effects: [] };
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
      const tipoVisita = visitaDaOpcao(input.optionId);
      if (tipoVisita === null) throw opcaoInvalida();
      // A busca de horários acontece nesta mesma ação. O serviço decide, pelo resultado, se o passo
      // seguinte é a escolha de horário ou o aviso de ausência de horários.
      return {
        nextStep: 'slot_selection',
        effects: [{ type: 'answer_visit_kind', tipoVisita }, { type: 'search_slots' }],
      };
    }

    case 'slot_selection': {
      if (input.type !== 'select_slot') throw naoPermitido();
      const horarioId = decodeId('slot', input.slotId);
      if (horarioId === null || !ctx.offeredSlotIds.includes(horarioId)) {
        throw new AppError('INVALID_SLOT', 'Horário não oferecido nesta tentativa.', {
          slotId: 'Horário não oferecido nesta tentativa.',
        });
      }
      // Com paciente já identificado, a seleção conclui a nova reserva sem pedir os dados de novo.
      if (ctx.hasPatient) {
        return {
          nextStep: 'menu',
          effects: [
            { type: 'select_slot', horarioId },
            { type: 'confirm_appointment', paciente: null },
          ],
        };
      }
      return { nextStep: 'patient_data', effects: [{ type: 'select_slot', horarioId }] };
    }

    case 'patient_data': {
      if (input.type !== 'submit_patient') throw naoPermitido();
      const paciente = validarPaciente(input.patient, ctx.hojeLocal);
      return {
        nextStep: 'menu',
        effects: [{ type: 'confirm_appointment', paciente }],
      };
    }

    case 'clinic_information': {
      if (input.type !== 'select_option') throw naoPermitido();
      if (input.optionId !== 'opt_menu') throw opcaoInvalida();
      return { nextStep: 'menu', effects: [] };
    }

    case 'appointments': {
      if (input.type === 'cancel_appointment') {
        const reservaId = decodeId('ap', input.appointmentId);
        if (reservaId === null) {
          throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado nesta conversa.');
        }
        return { nextStep: 'menu', effects: [{ type: 'cancel_appointment', reservaId }] };
      }
      if (input.type !== 'select_option') throw naoPermitido();
      if (input.optionId !== 'opt_menu') throw opcaoInvalida();
      return { nextStep: 'menu', effects: [] };
    }

    case 'continue_after_no_slots': {
      if (input.type !== 'select_option') throw naoPermitido();
      if (input.optionId !== 'opt_continue') throw opcaoInvalida();
      return { nextStep: 'menu', effects: [] };
    }

    default:
      throw naoPermitido();
  }
}
