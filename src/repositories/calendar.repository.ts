import type { Pool, PoolClient } from 'pg';
import type { DayAppointment } from '../services/calendar-summary';

type Db = Pool | PoolClient;

export interface RoomCapacity {
  salaId: number;
  nome: string;
  totalHorarios: number;
  horariosOcupados: number;
}

/**
 * Consultas por data, no fuso de negócio. A data é a da consulta marcada (RN-23). A API não decide
 * o layout da grade: devolve só a contagem por data que o intervalo pedir.
 */
export class CalendarRepository {
  /** Quantidade de consultas por data local, incluindo canceladas, para datas no intervalo. */
  async countsByDate(
    inicio: string,
    fimExclusivo: string,
    db: Db,
  ): Promise<Record<string, number>> {
    const { rows } = await db.query<{ dia: string; n: number }>(
      `SELECT (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia, count(*)::int AS n
         FROM reserva r
         JOIN horario h ON h.id_horario = r.id_horario
        WHERE h.inicio >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
          AND h.inicio < ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
        GROUP BY 1`,
      [inicio, fimExclusivo],
    );
    return Object.fromEntries(rows.map((row) => [row.dia, row.n]));
  }

  /** Consultas de uma data local, com a hora local e a sala. */
  async appointmentsOfDay(data: string, db: Db): Promise<DayAppointment[]> {
    const { rows } = await db.query<{
      id_sala: number;
      hora: number;
      cancelada_em: Date | null;
      fim: Date;
    }>(
      `SELECT h.id_sala,
              extract(hour FROM (h.inicio AT TIME ZONE 'America/Sao_Paulo'))::int AS hora,
              r.cancelada_em,
              h.fim
         FROM reserva r
         JOIN horario h ON h.id_horario = r.id_horario
        WHERE h.inicio >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND h.inicio < (($1::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
      [data],
    );
    return rows.map((row) => ({
      salaId: row.id_sala,
      hora: row.hora,
      canceladaEm: row.cancelada_em,
      fim: row.fim,
    }));
  }

  /**
   * Capacidade de cada sala do cadastro na data, calculada separadamente das consultas. Sala sem
   * horário na data aparece com zero. Horário ocupado é o que tem reserva não cancelada.
   */
  async roomCapacityOfDay(data: string, db: Db): Promise<RoomCapacity[]> {
    const { rows } = await db.query<{
      id_sala: number;
      nome: string;
      total: number;
      ocupados: number;
    }>(
      `SELECT s.id_sala, s.nome,
              COALESCE(cap.total, 0)::int AS total,
              COALESCE(cap.ocupados, 0)::int AS ocupados
         FROM sala s
         LEFT JOIN (
           SELECT h.id_sala,
                  count(*) AS total,
                  count(*) FILTER (
                    WHERE EXISTS (
                      SELECT 1 FROM reserva r
                       WHERE r.id_horario = h.id_horario AND r.cancelada_em IS NULL)) AS ocupados
             FROM horario h
            WHERE h.inicio >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND h.inicio < (($1::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
            GROUP BY h.id_sala
         ) cap ON cap.id_sala = s.id_sala
        ORDER BY s.id_sala`,
      [data],
    );
    return rows.map((row) => ({
      salaId: row.id_sala,
      nome: row.nome,
      totalHorarios: row.total,
      horariosOcupados: row.ocupados,
    }));
  }
}
