import type { Pool } from 'pg';
import type { PeriodFacts } from '../services/analytics-kpis';

const BUSINESS_TZ = 'America/Sao_Paulo';

/**
 * Leituras de Analytics. Cada método recebe um intervalo `[inicio, fim)` em instantes com fuso e o
 * instante de avaliação. Nada aqui grava dados.
 */
export class AnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  /** Fatos de um período. Conversas são agrupadas pela data de início; eventos não são filtrados pelo fim. */
  async facts(inicio: string, fim: string, now: Date): Promise<PeriodFacts> {
    const [cohort, durations, agenda, searches] = await Promise.all([
      this.pool.query<{ started: number; scheduling: number; confirmed: number; outside: number }>(
        `WITH coorte AS (
           SELECT c.id_conversa,
                  EXISTS (SELECT 1 FROM evento_conversa e
                           WHERE e.id_conversa = c.id_conversa
                             AND e.tipo = 'STARTED_SCHEDULING' AND e.instante <= $3) AS agendou,
                  EXISTS (SELECT 1 FROM evento_conversa e
                           WHERE e.id_conversa = c.id_conversa
                             AND e.tipo = 'APPOINTMENT_CONFIRMED' AND e.instante <= $3) AS confirmou,
                  NOT EXISTS (SELECT 1 FROM expediente x
                               WHERE x.dia_semana = extract(dow FROM (c.inicio AT TIME ZONE '${BUSINESS_TZ}'))::int
                                 AND x.abertura IS NOT NULL AND x.fechamento IS NOT NULL
                                 AND (c.inicio AT TIME ZONE '${BUSINESS_TZ}')::time >= x.abertura
                                 AND (c.inicio AT TIME ZONE '${BUSINESS_TZ}')::time < x.fechamento) AS fora_do_expediente
             FROM conversa c
            WHERE c.inicio >= $1::timestamptz AND c.inicio < $2::timestamptz AND c.inicio <= $3
         )
         SELECT count(*)::int AS started,
                count(*) FILTER (WHERE agendou)::int AS scheduling,
                count(*) FILTER (WHERE agendou AND confirmou)::int AS confirmed,
                count(*) FILTER (WHERE fora_do_expediente)::int AS outside
           FROM coorte`,
        [inicio, fim, now],
      ),
      this.pool.query<{ seconds: number }>(
        `SELECT extract(epoch FROM (min(e.instante) - c.inicio))::float8 AS seconds
           FROM conversa c
           JOIN evento_conversa e ON e.id_conversa = c.id_conversa
                                 AND e.tipo = 'APPOINTMENT_CONFIRMED' AND e.instante <= $3
          WHERE c.inicio >= $1::timestamptz AND c.inicio < $2::timestamptz AND c.inicio <= $3
            AND EXISTS (SELECT 1 FROM evento_conversa s
                         WHERE s.id_conversa = c.id_conversa
                           AND s.tipo = 'STARTED_SCHEDULING' AND s.instante <= $3)
          GROUP BY c.id_conversa, c.inicio`,
        [inicio, fim, now],
      ),
      this.pool.query<{ total: number; occupied: number }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM reserva r WHERE r.id_horario = h.id_horario AND r.cancelada_em IS NULL
                ))::int AS occupied
           FROM horario h
          WHERE h.inicio >= $1::timestamptz AND h.inicio < $2::timestamptz`,
        [inicio, fim],
      ),
      this.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM busca_sem_horario
          WHERE instante >= $1::timestamptz AND instante < $2::timestamptz AND instante <= $3`,
        [inicio, fim, now],
      ),
    ]);

    const coorte = cohort.rows[0]!;
    const agenda0 = agenda.rows[0]!;
    return {
      started: coorte.started,
      scheduling: coorte.scheduling,
      confirmed: coorte.confirmed,
      durationsSeconds: durations.rows.map((row) => row.seconds),
      outside: coorte.outside,
      totalSlots: agenda0.total,
      occupiedSlots: agenda0.occupied,
      searchesWithoutSlots: searches.rows[0]!.n,
    };
  }
}
