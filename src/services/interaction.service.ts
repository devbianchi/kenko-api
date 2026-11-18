import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../database/transaction';
import { AppError } from '../errors/app-error';
import type { ActionRepository } from '../repositories/action.repository';
import type { AttemptRepository } from '../repositories/attempt.repository';
import type { ClinicRepository } from '../repositories/clinic.repository';
import type { ConversationRepository } from '../repositories/conversation.repository';
import type { EventRepository } from '../repositories/event.repository';
import type { RoteiroRepository } from '../repositories/roteiro.repository';
import type { SlotRepository } from '../repositories/slot.repository';
import type { InteractionBody } from '../schemas/interaction.schema';
import type { Clock } from '../shared/clock';
import { interactionDto, type InteractionDto } from '../shared/conversation-dto';
import { effectiveStatus } from './conversation-status';
import type { ConversationViewBuilder } from './conversation-view';
import { hashInput } from './interaction-hash';
import { type Effect, transition } from './interaction-machine';
import { selectOffers, weekBounds } from './slot-search';

type Db = Pool | PoolClient;

/** Resultado de um efeito: a tentativa atual e, se o efeito mudou o passo, o passo seguinte. */
interface EffectOutcome {
  idTentativa: number | null;
  proximoPasso?: string;
}

/** Duração de uma semana, usada para o fim da próxima semana. */
const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Processa uma ação do paciente seguindo o ADR-0006: idempotência por actionId, depois revisão,
 * depois a regra do passo, tudo numa transação. A conversa fica travada até o fim da ação, então
 * ações concorrentes da mesma conversa são serializadas.
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
    private readonly views: ConversationViewBuilder,
    private readonly clock: Clock,
  ) {}

  async process(conversationId: number, body: InteractionBody): Promise<InteractionDto> {
    const now = this.clock.now();
    const hash = hashInput(body.input);

    return withTransaction(this.pool, async (client) => {
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
        if (salva.hash === hash) return salva.resultado as InteractionDto;
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

      const passo = transition(conversa.step, body.input, {
        specialtyIds: await this.specialtyIds(client),
        offeredSlotIds:
          conversa.attemptId === null
            ? []
            : await this.slots.offeredIds(conversa.attemptId, client),
      });

      let idTentativa = conversa.attemptId;
      let proximoPasso = passo.nextStep;
      for (const effect of passo.effects) {
        const resultado = await this.applyEffect(effect, conversationId, idTentativa, now, client);
        idTentativa = resultado.idTentativa;
        if (resultado.proximoPasso) proximoPasso = resultado.proximoPasso;
      }

      const encerrando = proximoPasso === 'closed';
      const aplicada = await this.conversations.updateAfterAction(client, {
        id: conversationId,
        expectedRevision: body.expectedRevision,
        instante: now,
        idPasso: await this.roteiro.findStepId(proximoPasso, client),
        idTentativaAtual: idTentativa,
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
      const texto = await this.roteiro.findStepText(proximoPasso, client);
      const idMensagem = await this.conversations.insertBotInteraction(client, conversationId, now);

      const atualizada = await this.conversations.findById(conversationId, client);
      if (!atualizada) throw new Error('Conversa sumiu durante a ação.');
      const view = await this.views.build(proximoPasso, idTentativa, client);
      const dto = interactionDto(atualizada, effectiveStatus(atualizada, now), view, [
        { id: `msg_${idMensagem}`, author: 'bot', text: texto, sentAt: now },
      ]);

      await this.actions.insert(conversationId, body.actionId, hash, dto, now, client);
      return dto;
    });
  }

  private async specialtyIds(db: Db): Promise<number[]> {
    const clinica = await this.clinics.findFirst(db);
    if (!clinica) return [];
    const especialidades = await this.clinics.findSpecialties(clinica.id, db);
    return especialidades.map((especialidade) => especialidade.id);
  }

  private async applyEffect(
    effect: Effect,
    conversationId: number,
    idTentativa: number | null,
    now: Date,
    db: Db,
  ): Promise<EffectOutcome> {
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
        return { idTentativa: id };
      }

      case 'answer_specialty': {
        const tentativa = requireAttempt(idTentativa);
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
        return { idTentativa: tentativa };
      }

      case 'answer_visit_kind': {
        const tentativa = requireAttempt(idTentativa);
        await this.attempts.setVisitKind(tentativa, effect.tipoVisita, db);
        return { idTentativa: tentativa };
      }

      case 'search_slots':
        return this.searchSlots(conversationId, requireAttempt(idTentativa), now, db);

      case 'exit': {
        if (idTentativa !== null) {
          await this.attempts.finish(idTentativa, 'exited', now, db);
        }
        await this.events.insert(
          { idConversa: conversationId, idTentativa, tipo: 'EXITED', instante: now },
          db,
        );
        return { idTentativa };
      }
    }
  }

  /**
   * Busca os horários da tentativa (RF-02). Registra o resultado como evento. Sem horários, grava
   * uma ocorrência de busca vazia (RN-21) e leva ao aviso de continuação. Com horários, guarda a
   * oferta para a escolha validar depois.
   */
  private async searchSlots(
    conversationId: number,
    idTentativa: number,
    now: Date,
    db: Db,
  ): Promise<EffectOutcome> {
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
      return { idTentativa, proximoPasso: 'continue_after_no_slots' };
    }

    await this.slots.insertOffers(
      idTentativa,
      escolhidos.map((horario) => horario.id),
      db,
    );
    return { idTentativa, proximoPasso: 'slot_selection' };
  }
}

function requireAttempt(idTentativa: number | null): number {
  if (idTentativa === null) {
    throw new Error('Passo de agendamento sem tentativa iniciada.');
  }
  return idTentativa;
}
