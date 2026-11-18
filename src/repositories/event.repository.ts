import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

export type TipoEvento =
  | 'STARTED_SCHEDULING'
  | 'ANSWERED_SPECIALTY'
  | 'SLOT_SEARCH_RESULT'
  | 'SELECTED_SLOT'
  | 'APPOINTMENT_CONFIRMED'
  | 'EXITED';

/** Fatos do funil (MET-A06 e MET-A07). Não guarda texto de conversa. */
export class EventRepository {
  async insert(
    evento: {
      idConversa: number;
      idTentativa: number | null;
      tipo: TipoEvento;
      instante: Date;
      idEspecialidade?: number | null;
      idHorario?: number | null;
      idReserva?: number | null;
    },
    db: Db,
  ): Promise<void> {
    await db.query(
      `INSERT INTO evento_conversa
         (id_conversa, id_tentativa, tipo, instante, id_especialidade, id_horario, id_reserva)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        evento.idConversa,
        evento.idTentativa,
        evento.tipo,
        evento.instante,
        evento.idEspecialidade ?? null,
        evento.idHorario ?? null,
        evento.idReserva ?? null,
      ],
    );
  }
}
