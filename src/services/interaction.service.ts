import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../database/transaction';
import { AppError } from '../errors/app-error';
import type { ActionRepository } from '../repositories/action.repository';
import type { AttemptRepository } from '../repositories/attempt.repository';
import type { ConversationRepository } from '../repositories/conversation.repository';
import type { EventRepository } from '../repositories/event.repository';
import type { RoteiroRepository } from '../repositories/roteiro.repository';
import type { ClinicRepository } from '../repositories/clinic.repository';
import type { InteractionBody } from '../schemas/interaction.schema';
import { interactionDto, type InteractionDto } from '../shared/conversation-dto';
import type { Clock } from '../shared/clock';
import { effectiveStatus } from './conversation-status';
import type { ConversationViewBuilder } from './conversation-view';
import { hashInput } from './interaction-hash';
import { type Effect, transition } from './interaction-machine';

type Db = Pool | PoolClient;

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

      const specialtyIds = await this.specialtyIds(client);
      const passo = transition(conversa.step, body.input, { specialtyIds });

      let idTentativa = conversa.attemptId;
      for (const effect of passo.effects) {
        idTentativa = await this.applyEffect(effect, conversationId, idTentativa, now, client);
      }

      const encerrando = passo.nextStep === 'closed';
      const aplicada = await this.conversations.updateAfterAction(client, {
        id: conversationId,
        expectedRevision: body.expectedRevision,
        instante: now,
        idPasso: await this.roteiro.findStepId(passo.nextStep, client),
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
      const texto = await this.roteiro.findStepText(passo.nextStep, client);
      const idMensagem = await this.conversations.insertBotInteraction(client, conversationId, now);

      const atualizada = await this.conversations.findById(conversationId, client);
      if (!atualizada) throw new Error('Conversa sumiu durante a ação.');
      const view = await this.views.build(passo.nextStep, client);
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

  /** Aplica um efeito do passo e devolve a tentativa atual, que pode ter sido criada agora. */
  private async applyEffect(
    effect: Effect,
    conversationId: number,
    idTentativa: number | null,
    now: Date,
    db: Db,
  ): Promise<number | null> {
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
        return id;
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
        return tentativa;
      }
      case 'answer_visit_kind': {
        const tentativa = requireAttempt(idTentativa);
        await this.attempts.setVisitKind(tentativa, effect.tipoVisita, db);
        return tentativa;
      }
      case 'exit': {
        if (idTentativa !== null) {
          await this.attempts.finish(idTentativa, 'exited', now, db);
        }
        await this.events.insert(
          { idConversa: conversationId, idTentativa, tipo: 'EXITED', instante: now },
          db,
        );
        return idTentativa;
      }
    }
  }
}

function requireAttempt(idTentativa: number | null): number {
  if (idTentativa === null) {
    throw new Error('Passo de agendamento sem tentativa iniciada.');
  }
  return idTentativa;
}
