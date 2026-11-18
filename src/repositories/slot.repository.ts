import type { Pool, PoolClient } from 'pg';
import type { SlotView } from '../models/conversation.model';
import type { SlotCandidate } from '../services/slot-search';
import { encodeId } from '../shared/opaque-id';

type Db = Pool | PoolClient;

export interface EligibleSlot extends SlotCandidate {
  fim: Date;
}

interface SlotRow {
  id: number;
  inicio: Date;
  fim: Date;
  id_medico: number;
  nome_medico: string;
  id_sala: number;
  nome_sala: string;
}

function toSlotView(row: SlotRow): SlotView {
  return {
    id: encodeId('slot', row.id),
    startsAt: row.inicio,
    endsAt: row.fim,
    doctor: { id: encodeId('dr', row.id_medico), name: row.nome_medico },
    room: { id: encodeId('room', row.id_sala), name: row.nome_sala },
  };
}

/** Horários da agenda e os horários oferecidos em cada tentativa. */
export class SlotRepository {
  /**
   * Horários futuros e livres de médicos da especialidade, entre `agora` (exclusive) e `fim`
   * (exclusive), ordenados por início e identificador. Um horário com reserva ativa não aparece.
   */
  async findEligible(
    especialidadeId: number,
    agora: Date,
    fim: Date,
    db: Db,
  ): Promise<EligibleSlot[]> {
    const { rows } = await db.query<SlotRow>(
      `SELECT h.id_horario AS id, h.inicio, h.fim,
              m.id_medico, m.nome_medico, s.id_sala, s.nome AS nome_sala
         FROM horario h
         JOIN medico m ON m.id_medico = h.id_medico
         JOIN sala s ON s.id_sala = h.id_sala
        WHERE m.id_especialidade = $1
          AND h.inicio > $2
          AND h.inicio < $3
          AND NOT EXISTS (
              SELECT 1 FROM reserva r
               WHERE r.id_horario = h.id_horario AND r.cancelada_em IS NULL)
        ORDER BY h.inicio, h.id_horario`,
      [especialidadeId, agora, fim],
    );
    return rows.map((row) => ({ id: row.id, inicio: row.inicio, fim: row.fim }));
  }

  /** Verifica se o horário ainda é futuro e não tem reserva ativa, no momento da seleção. */
  async isFree(idHorario: number, agora: Date, db: Db): Promise<boolean> {
    const { rows } = await db.query<{ ok: boolean }>(
      `SELECT EXISTS (
          SELECT 1 FROM horario h
           WHERE h.id_horario = $1
             AND h.inicio > $2
             AND NOT EXISTS (
                 SELECT 1 FROM reserva r
                  WHERE r.id_horario = h.id_horario AND r.cancelada_em IS NULL)
       ) AS ok`,
      [idHorario, agora],
    );
    return rows[0]!.ok;
  }

  /** Um horário pelo identificador, na forma da tela. Usado para o horário escolhido. */
  async findOne(idHorario: number, db: Db): Promise<SlotView | null> {
    const { rows } = await db.query<SlotRow>(
      `SELECT h.id_horario AS id, h.inicio, h.fim,
              m.id_medico, m.nome_medico, s.id_sala, s.nome AS nome_sala
         FROM horario h
         JOIN medico m ON m.id_medico = h.id_medico
         JOIN sala s ON s.id_sala = h.id_sala
        WHERE h.id_horario = $1`,
      [idHorario],
    );
    return rows[0] ? toSlotView(rows[0]) : null;
  }

  async insertOffers(idTentativa: number, idsHorario: number[], db: Db): Promise<void> {
    for (const [indice, idHorario] of idsHorario.entries()) {
      await db.query(
        `INSERT INTO oferta_horario (id_tentativa, id_horario, ordem) VALUES ($1, $2, $3)`,
        [idTentativa, idHorario, indice + 1],
      );
    }
  }

  /** Horários já oferecidos na tentativa, na ordem mostrada. Reexibir não executa nova busca. */
  async findOffered(idTentativa: number, db: Db): Promise<SlotView[]> {
    const { rows } = await db.query<SlotRow>(
      `SELECT h.id_horario AS id, h.inicio, h.fim,
              m.id_medico, m.nome_medico, s.id_sala, s.nome AS nome_sala
         FROM oferta_horario o
         JOIN horario h ON h.id_horario = o.id_horario
         JOIN medico m ON m.id_medico = h.id_medico
         JOIN sala s ON s.id_sala = h.id_sala
        WHERE o.id_tentativa = $1
        ORDER BY o.ordem`,
      [idTentativa],
    );
    return rows.map(toSlotView);
  }

  async offeredIds(idTentativa: number, db: Db): Promise<number[]> {
    const { rows } = await db.query<{ id: number }>(
      'SELECT id_horario AS id FROM oferta_horario WHERE id_tentativa = $1',
      [idTentativa],
    );
    return rows.map((row) => row.id);
  }

  /** Cada busca sem horários é uma ocorrência (RN-21). Não há unicidade por conversa. */
  async insertSearchWithoutSlots(
    idConversa: number,
    idTentativa: number,
    idEspecialidade: number,
    instante: Date,
    db: Db,
  ): Promise<void> {
    await db.query(
      `INSERT INTO busca_sem_horario (id_conversa, id_tentativa, id_especialidade, instante)
       VALUES ($1, $2, $3, $4)`,
      [idConversa, idTentativa, idEspecialidade, instante],
    );
  }
}
