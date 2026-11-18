import type { Pool, PoolClient } from 'pg';
import { SlotTakenError } from '../errors/slot-taken-error';

type Db = Pool | PoolClient;

export const RESERVA_ATIVA_UNICA = 'uq_reserva_horario_ativa';

/** Reservas. A unicidade de horário ativo é garantida pelo índice do banco (ADR-0007). */
export class ReservationRepository {
  /**
   * Cria a reserva. Se outra reserva ativa já ocupa o horário, a violação do índice vira
   * SlotTakenError, para que o pipeline responda com a nova tela de horários.
   */
  async insert(
    idHorario: number,
    idPaciente: number,
    idConversa: number,
    instante: Date,
    db: Db,
  ): Promise<number> {
    try {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em)
         VALUES ($1, $2, $3, $4) RETURNING id_reserva AS id`,
        [idHorario, idPaciente, idConversa, instante],
      );
      return rows[0]!.id;
    } catch (err) {
      const pg = err as { code?: string; constraint?: string };
      if (pg.code === '23505' && pg.constraint === RESERVA_ATIVA_UNICA) {
        throw new SlotTakenError();
      }
      throw err;
    }
  }
}
