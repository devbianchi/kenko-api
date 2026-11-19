import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../database/transaction';
import { AppError } from '../errors/app-error';
import { SlotTakenError } from '../errors/slot-taken-error';
import type { BotMessage, ConversationRecord } from '../models/conversation.model';
import type { ActionRepository } from '../repositories/action.repository';
import type { AttemptRepository } from '../repositories/attempt.repository';
import type { ClinicRepository } from '../repositories/clinic.repository';
import type { ConversationRepository } from '../repositories/conversation.repository';
import type { EventRepository } from '../repositories/event.repository';
import type { PatientRepository } from '../repositories/patient.repository';
import type { ReservationRepository } from '../repositories/reservation.repository';
import type { RoteiroRepository } from '../repositories/roteiro.repository';
import type { SlotRepository } from '../repositories/slot.repository';
import type { InteractionBody } from '../schemas/interaction.schema';
import type { Clock } from '../shared/clock';
import { toBusinessIso } from '../shared/business-time';
import { formatarData, formatarHora, renderizarTexto } from '../shared/mensagens';
import {
  type ActionOutcome,
  type AppointmentCancelledResult,
  type AppointmentResult,
  interactionDto,
  slotUnavailableBody,
} from '../shared/conversation-dto';
import { encodeId } from '../shared/opaque-id';
import { appointmentStatus } from './appointment-status';
import { effectiveStatus } from './conversation-status';
import type { ConversationViewBuilder } from './conversation-view';
import { hashInput } from './interaction-hash';
import { type DadosPaciente, type Effect, transition } from './interaction-machine';
import { selectOffers, weekBounds } from './slot-search';

type Db = Pool | PoolClient;

/** Duração de uma semana, usada para o fim da próxima semana. */
const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/** Estado acumulado durante a aplicação dos efeitos de uma ação. */
interface Progresso {
  idTentativa: number | null;
  proximoPasso: string;
  idPaciente: number | null;
  limparTentativa: boolean;
  resultado: AppointmentResult | AppointmentCancelledResult | null;
  /** Início do horário confirmado, para o texto da confirmação. */
  horarioInicio: Date | null;
}

/**
 * Processa uma ação do paciente seguindo o ADR-0006: idempotência por actionId, depois revisão,
 * depois a regra do passo, tudo numa transação. A conversa fica travada até o fim da ação, então
 * ações concorrentes da mesma conversa são serializadas.
 *
 * O resultado de cada ação aceita, inclusive a disputa de horário (409), é guardado para que um
 * reenvio devolva exatamente a mesma resposta.
 */
export class InteractionService {
  constructor(
    private readonly pool: Pool,
    private readonly conversations: ConversationRepository,
    private readonly roteiro: RoteiroRepository,
    private readonly clinics: ClinicRepository,
    private readonly attempts: AttemptRepository,
    private readonly events: EventRepository,
    private readonly actions: ActionRepository,
    private readonly slots: SlotRepository,
    private readonly patients: PatientRepository,
    private readonly reservations: ReservationRepository,
    private readonly views: ConversationViewBuilder,
    private readonly clock: Clock,
  ) {}

  async process(conversationId: number, body: InteractionBody): Promise<ActionOutcome> {
    const now = this.clock.now();
    const hash = hashInput(body.input);

    try {
      return await withTransaction(this.pool, (client) =>
        this.execute(client, conversationId, body, hash, now, false),
      );
    } catch (err) {
      if (err instanceof SlotTakenError) {
        // A confirmação foi desfeita pelo banco. A conflito é tratada numa transação nova.
        return withTransaction(this.pool, (client) =>
          this.execute(client, conversationId, body, hash, now, true),
        );
      }
      throw err;
    }
  }

  private async execute(
    client: PoolClient,
    conversationId: number,
    body: InteractionBody,
    hash: string,
    now: Date,
    conflitoConhecido: boolean,
  ): Promise<ActionOutcome> {
    if (!(await this.conversations.lock(conversationId, client))) {
      throw new AppError('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    }
    // Lida depois do lock: já enxerga o que a ação concorrente anterior gravou.
    const conversa = await this.conversations.findById(conversationId, client);
    if (!conversa) {
      throw new AppError('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    }

    // Idempotência vem antes da revisão: um reenvio legítimo traz a revisão original (ADR-0006).
    const salva = await this.actions.find(conversationId, body.actionId, client);
    if (salva) {
      if (salva.hash === hash) return salva.resultado as ActionOutcome;
      throw new AppError('ACTION_ID_CONFLICT', 'Este actionId já foi usado com outro conteúdo.');
    }

    const status = effectiveStatus(conversa, now);
    if (status === 'closed') {
      throw new AppError('CONVERSATION_CLOSED', 'Esta conversa já foi encerrada.');
    }
    if (status === 'abandoned') {
      throw new AppError('CONVERSATION_ABANDONED', 'Esta conversa terminou por inatividade.');
    }

    if (conversa.revision !== body.expectedRevision) {
      throw new AppError(
        'STALE_CONVERSATION_STATE',
        'O estado da conversa mudou. Atualize a tela.',
      );
    }

    if (conflitoConhecido) {
      return this.conflito(client, conversa, body, hash, now);
    }

    const passo = transition(conversa.step, body.input, {
      specialtyIds: await this.specialtyIds(client),
      offeredSlotIds:
        conversa.attemptId === null ? [] : await this.slots.offeredIds(conversa.attemptId, client),
      hasPatient: conversa.patientId !== null,
      hojeLocal: toBusinessIso(now).slice(0, 10),
    });

    const progresso: Progresso = {
      idTentativa: conversa.attemptId,
      proximoPasso: passo.nextStep,
      idPaciente: null,
      limparTentativa: false,
      resultado: null,
      horarioInicio: null,
    };

    for (const effect of passo.effects) {
      if (effect.type === 'select_slot') {
        if (!(await this.slots.isFree(effect.horarioId, now, client))) {
          return this.conflito(client, conversa, body, hash, now);
        }
      }
      await this.applyEffect(effect, conversa, progresso, now, client);
    }

    const encerrando = progresso.proximoPasso === 'closed';
    const aplicada = await this.conversations.updateAfterAction(client, {
      id: conversationId,
      expectedRevision: body.expectedRevision,
      instante: now,
      idPasso: await this.roteiro.findStepId(progresso.proximoPasso, client),
      idTentativaAtual: progresso.idTentativa,
      limparTentativa: progresso.limparTentativa,
      idPaciente: progresso.idPaciente,
      encerradaEm: encerrando ? now : null,
      encerramentoMotivo: encerrando ? 'exited' : null,
      encerramentoEtapa: encerrando
        ? await this.roteiro.findStepEtapa(conversa.step, client)
        : null,
    });
    if (!aplicada) {
      throw new AppError(
        'STALE_CONVERSATION_STATE',
        'O estado da conversa mudou. Atualize a tela.',
      );
    }

    await this.actions.insertPatientInteraction(conversationId, now, client);
    const mensagens = await this.mensagensDoPasso(conversationId, progresso, now, client);
    const atualizada = await this.conversations.findById(conversationId, client);
    if (!atualizada) throw new Error('Conversa sumiu durante a ação.');
    const view = await this.views.build(
      progresso.proximoPasso,
      {
        conversationId,
        attemptId: progresso.idTentativa,
        agora: now,
        ativa: effectiveStatus(atualizada, now) === 'active',
      },
      client,
    );

    const dto = interactionDto(
      atualizada,
      effectiveStatus(atualizada, now),
      view,
      mensagens,
      progresso.resultado,
    );
    const outcome: ActionOutcome = { status: 200, body: dto };
    await this.actions.insert(conversationId, body.actionId, hash, outcome, now, client);
    return outcome;
  }

  /** Aplica um efeito e atualiza o progresso da ação. */
  private async applyEffect(
    effect: Effect,
    conversa: ConversationRecord,
    progresso: Progresso,
    now: Date,
    db: Db,
  ): Promise<void> {
    const conversationId = conversa.id;

    switch (effect.type) {
      case 'start_attempt': {
        const numero = await this.attempts.nextNumber(conversationId, db);
        const id = await this.attempts.insert(conversationId, numero, now, db);
        await this.events.insert(
          {
            idConversa: conversationId,
            idTentativa: id,
            tipo: 'STARTED_SCHEDULING',
            instante: now,
          },
          db,
        );
        progresso.idTentativa = id;
        return;
      }

      case 'answer_specialty': {
        const tentativa = requireAttempt(progresso.idTentativa);
        await this.attempts.setSpecialty(tentativa, effect.especialidadeId, db);
        await this.events.insert(
          {
            idConversa: conversationId,
            idTentativa: tentativa,
            tipo: 'ANSWERED_SPECIALTY',
            instante: now,
            idEspecialidade: effect.especialidadeId,
          },
          db,
        );
        return;
      }

      case 'answer_visit_kind': {
        const tentativa = requireAttempt(progresso.idTentativa);
        await this.attempts.setVisitKind(tentativa, effect.tipoVisita, db);
        return;
      }

      case 'search_slots': {
        const resultado = await this.searchSlots(
          conversationId,
          requireAttempt(progresso.idTentativa),
          now,
          db,
        );
        progresso.proximoPasso = resultado;
        return;
      }

      case 'select_slot': {
        const tentativa = requireAttempt(progresso.idTentativa);
        await this.attempts.setSelectedSlot(tentativa, effect.horarioId, db);
        await this.events.insert(
          {
            idConversa: conversationId,
            idTentativa: tentativa,
            tipo: 'SELECTED_SLOT',
            instante: now,
            idHorario: effect.horarioId,
          },
          db,
        );
        return;
      }

      case 'confirm_appointment': {
        await this.confirmAppointment(effect.paciente, conversa, progresso, now, db);
        return;
      }

      case 'cancel_appointment': {
        await this.cancelAppointment(effect.reservaId, conversa, progresso, now, db);
        return;
      }

      case 'exit': {
        if (progresso.idTentativa !== null) {
          await this.attempts.finish(progresso.idTentativa, 'exited', now, db);
        }
        await this.events.insert(
          {
            idConversa: conversationId,
            idTentativa: progresso.idTentativa,
            tipo: 'EXITED',
            instante: now,
          },
          db,
        );
        return;
      }
    }
  }

  /**
   * Cria o paciente (se a conversa ainda não tem um) e a reserva, registra APPOINTMENT_CONFIRMED,
   * fecha a tentativa e devolve ao menu. Se o horário já tiver reserva ativa, a violação do índice
   * vira SlotTakenError e a transação inteira é desfeita.
   */
  private async confirmAppointment(
    paciente: DadosPaciente | null,
    conversa: ConversationRecord,
    progresso: Progresso,
    now: Date,
    db: Db,
  ): Promise<void> {
    const tentativa = requireAttempt(progresso.idTentativa);
    const horarioId = await this.attempts.findSelectedSlot(tentativa, db);
    if (horarioId === null) throw new Error('Confirmação sem horário selecionado.');

    const pacienteId = paciente
      ? await this.patients.insert(paciente.name, paciente.birthDate, db)
      : conversa.patientId;
    if (pacienteId === null) throw new Error('Confirmação sem paciente identificado.');

    const reservaId = await this.reservations.insert(horarioId, pacienteId, conversa.id, now, db);
    await this.attempts.finishConfirmed(tentativa, now, db);
    await this.events.insert(
      {
        idConversa: conversa.id,
        idTentativa: tentativa,
        tipo: 'APPOINTMENT_CONFIRMED',
        instante: now,
        idHorario: horarioId,
        idReserva: reservaId,
      },
      db,
    );

    const horario = await this.slots.findOne(horarioId, db);
    if (!horario) throw new Error('Horário da reserva não encontrado.');

    progresso.idPaciente = pacienteId;
    progresso.horarioInicio = horario.startsAt;
    progresso.limparTentativa = true;
    progresso.idTentativa = null;
    progresso.proximoPasso = 'menu';
    progresso.resultado = {
      type: 'appointment_confirmed',
      appointment: {
        id: encodeId('ap', reservaId),
        conversationId: encodeId('cv', conversa.id),
        patientId: encodeId('pt', pacienteId),
        slotId: horario.id,
        status: 'pending',
        confirmedAt: toBusinessIso(now),
        startsAt: toBusinessIso(horario.startsAt),
        endsAt: toBusinessIso(horario.endsAt),
      },
    };
  }

  /**
   * Cancela uma reserva pendente da própria conversa (RN-18). A reserva de outra conversa é 404,
   * porque não se confirma a existência dela. Completa ou já cancelada é 409. Não apaga a
   * confirmação; o horário volta a ser oferecido na próxima busca, se ainda for futuro.
   */
  private async cancelAppointment(
    reservaId: number,
    conversa: ConversationRecord,
    progresso: Progresso,
    now: Date,
    db: Db,
  ): Promise<void> {
    const reserva = await this.reservations.findById(reservaId, db);
    if (!reserva || reserva.idConversaOrigem !== conversa.id) {
      throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado nesta conversa.');
    }
    const status = appointmentStatus({ canceladaEm: reserva.canceladaEm, fim: reserva.fim }, now);
    if (status !== 'pending') {
      throw new AppError('APPOINTMENT_NOT_CANCELLABLE', 'Esta consulta não pode ser cancelada.');
    }

    await this.reservations.cancel(reservaId, now, db);
    progresso.proximoPasso = 'menu';
    progresso.resultado = {
      type: 'appointment_cancelled',
      appointmentId: encodeId('ap', reservaId),
    };
  }

  /** Textos do passo seguinte. Depois de uma confirmação, vêm a confirmação e o menu. */
  private async mensagensDoPasso(
    conversationId: number,
    progresso: Progresso,
    now: Date,
    db: Db,
  ): Promise<BotMessage[]> {
    const mensagens: BotMessage[] = [];
    for (const { codigo, variaveis } of await this.textosDaAcao(progresso, db)) {
      const modelo = await this.roteiro.findStepText(codigo, db);
      const texto = renderizarTexto(modelo, variaveis);
      const idMensagem = await this.conversations.insertBotInteraction(db, conversationId, now);
      mensagens.push({ id: `msg_${idMensagem}`, author: 'bot', text: texto, sentAt: now });
    }
    return mensagens;
  }

  /** Quais textos do roteiro a ação mostra, e com quais valores preenchidos. */
  private async textosDaAcao(
    progresso: Progresso,
    db: Db,
  ): Promise<{ codigo: string; variaveis: Record<string, string> }[]> {
    if (progresso.resultado?.type === 'appointment_confirmed' && progresso.horarioInicio) {
      const inicio = progresso.horarioInicio;
      return [
        {
          codigo: 'confirmation',
          variaveis: { data: formatarData(inicio), hora: formatarHora(inicio) },
        },
        { codigo: 'back_to_menu', variaveis: {} },
      ];
    }
    if (progresso.resultado?.type === 'appointment_cancelled') {
      return [{ codigo: 'cancelled', variaveis: {} }];
    }

    const variaveis: Record<string, string> = {};
    if (progresso.proximoPasso === 'visit_kind' && progresso.idTentativa !== null) {
      const idEspecialidade = await this.attempts.findSpecialty(progresso.idTentativa, db);
      const nome =
        idEspecialidade === null ? null : await this.clinics.findSpecialtyName(idEspecialidade, db);
      variaveis.especialidade = nome ?? '';
    }
    return [{ codigo: progresso.proximoPasso, variaveis }];
  }

  /**
   * Disputa de horário (SLOT_UNAVAILABLE): limpa a escolha, faz uma nova busca e responde 409 com
   * a nova tela. A revisão avança porque a busca grava resultados novos.
   */
  private async conflito(
    client: PoolClient,
    conversa: ConversationRecord,
    body: InteractionBody,
    hash: string,
    now: Date,
  ): Promise<ActionOutcome> {
    const tentativa = requireAttempt(conversa.attemptId);
    await this.attempts.setSelectedSlot(tentativa, null, client);
    const proximoPasso = await this.searchSlots(conversa.id, tentativa, now, client);

    const aplicada = await this.conversations.updateAfterAction(client, {
      id: conversa.id,
      expectedRevision: body.expectedRevision,
      instante: now,
      idPasso: await this.roteiro.findStepId(proximoPasso, client),
      idTentativaAtual: tentativa,
      encerradaEm: null,
      encerramentoMotivo: null,
      encerramentoEtapa: null,
    });
    if (!aplicada) {
      throw new AppError(
        'STALE_CONVERSATION_STATE',
        'O estado da conversa mudou. Atualize a tela.',
      );
    }

    await this.actions.insertPatientInteraction(conversa.id, now, client);
    const texto = await this.roteiro.findStepText(proximoPasso, client);
    const idMensagem = await this.conversations.insertBotInteraction(client, conversa.id, now);
    const atualizada = await this.conversations.findById(conversa.id, client);
    if (!atualizada) throw new Error('Conversa sumiu durante a disputa de horário.');
    const view = await this.views.build(
      proximoPasso,
      { conversationId: conversa.id, attemptId: tentativa, agora: now, ativa: true },
      client,
    );

    const dto = interactionDto(
      atualizada,
      effectiveStatus(atualizada, now),
      view,
      [{ id: `msg_${idMensagem}`, author: 'bot', text: texto, sentAt: now }],
      null,
    );
    const outcome: ActionOutcome = {
      status: 409,
      body: slotUnavailableBody(dto, 'Este horário acabou de ser reservado. Escolha outro.'),
    };
    await this.actions.insert(conversa.id, body.actionId, hash, outcome, now, client);
    return outcome;
  }

  private async specialtyIds(db: Db): Promise<number[]> {
    const clinica = await this.clinics.findFirst(db);
    if (!clinica) return [];
    const especialidades = await this.clinics.findSpecialties(clinica.id, db);
    return especialidades.map((especialidade) => especialidade.id);
  }

  /**
   * Busca os horários da tentativa (RF-02). Registra o resultado como evento. Sem horários, grava
   * uma ocorrência de busca vazia (RN-21) e devolve o passo de continuação. Com horários, guarda a
   * oferta e devolve a escolha de horário.
   */
  private async searchSlots(
    conversationId: number,
    idTentativa: number,
    now: Date,
    db: Db,
  ): Promise<string> {
    const idEspecialidade = await this.attempts.findSpecialty(idTentativa, db);
    if (idEspecialidade === null) {
      throw new Error('Busca de horários sem especialidade escolhida.');
    }

    const { inicioProximaSemana } = weekBounds(now);
    const fimProximaSemana = new Date(inicioProximaSemana.getTime() + UMA_SEMANA_MS);
    const candidatos = await this.slots.findEligible(idEspecialidade, now, fimProximaSemana, db);
    const escolhidos = selectOffers(candidatos, inicioProximaSemana);

    await this.events.insert(
      { idConversa: conversationId, idTentativa, tipo: 'SLOT_SEARCH_RESULT', instante: now },
      db,
    );

    if (escolhidos.length === 0) {
      await this.slots.insertSearchWithoutSlots(
        conversationId,
        idTentativa,
        idEspecialidade,
        now,
        db,
      );
      return 'continue_after_no_slots';
    }

    await this.slots.insertOffers(
      idTentativa,
      escolhidos.map((horario) => horario.id),
      db,
    );
    return 'slot_selection';
  }
}

function requireAttempt(idTentativa: number | null): number {
  if (idTentativa === null) {
    throw new Error('Passo de agendamento sem tentativa iniciada.');
  }
  return idTentativa;
}
