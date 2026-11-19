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

  /** Marcos do funil para a coorte que iniciou agendamento. Cada marco conta a conversa uma vez. */
  async funnel(
    inicio: string,
    fim: string,
    now: Date,
  ): Promise<{
    started: number;
    answeredSpecialty: number;
    receivedSlotResult: number;
    selectedSlot: number;
    confirmed: number;
  }> {
    const { rows } = await this.pool.query<{
      started: number;
      triage: number;
      viu: number;
      escolheu: number;
      confirmou: number;
    }>(
      `WITH marcos AS (
         SELECT c.id_conversa,
                bool_or(e.tipo = 'STARTED_SCHEDULING') AS iniciou,
                bool_or(e.tipo = 'ANSWERED_SPECIALTY') AS triagem,
                bool_or(e.tipo = 'SLOT_SEARCH_RESULT') AS viu,
                bool_or(e.tipo = 'SELECTED_SLOT') AS escolheu,
                bool_or(e.tipo = 'APPOINTMENT_CONFIRMED') AS confirmou
           FROM conversa c
           LEFT JOIN evento_conversa e ON e.id_conversa = c.id_conversa AND e.instante <= $3
          WHERE c.inicio >= $1::timestamptz AND c.inicio < $2::timestamptz AND c.inicio <= $3
          GROUP BY c.id_conversa
       )
       SELECT count(*) FILTER (WHERE iniciou)::int AS started,
              count(*) FILTER (WHERE iniciou AND triagem)::int AS triage,
              count(*) FILTER (WHERE iniciou AND viu)::int AS viu,
              count(*) FILTER (WHERE iniciou AND escolheu)::int AS escolheu,
              count(*) FILTER (WHERE iniciou AND confirmou)::int AS confirmou
         FROM marcos`,
      [inicio, fim, now],
    );
    const row = rows[0]!;
    return {
      started: row.started,
      answeredSpecialty: row.triage,
      receivedSlotResult: row.viu,
      selectedSlot: row.escolheu,
      confirmed: row.confirmou,
    };
  }

  /**
   * Saídas e abandonos por etapa de término. Saída usa a etapa gravada ao sair; abandono usa a etapa
   * atual, com mais de uma hora de inatividade. Não grava nada: o abandono é calculado na leitura.
   */
  async endings(
    inicio: string,
    fim: string,
    now: Date,
  ): Promise<Array<{ stage: string; exited: number; abandoned: number }>> {
    const { rows } = await this.pool.query<{ stage: string; exited: number; abandoned: number }>(
      `SELECT etapa AS stage,
              count(*) FILTER (WHERE encerrada_em IS NOT NULL)::int AS exited,
              count(*) FILTER (WHERE encerrada_em IS NULL)::int AS abandoned
         FROM (
           SELECT c.encerrada_em, c.ultima_interacao,
                  CASE WHEN c.encerrada_em IS NOT NULL THEN c.encerramento_etapa ELSE p.etapa END AS etapa
             FROM conversa c
             JOIN passo_roteiro p ON p.id_passo = c.id_passo_atual
            WHERE c.inicio >= $1::timestamptz AND c.inicio < $2::timestamptz AND c.inicio <= $3
         ) t
        WHERE (encerrada_em IS NOT NULL OR $3::timestamptz > ultima_interacao + interval '1 hour')
          AND etapa IN ('triage', 'slot_selection', 'patient_data', 'confirmation')
        GROUP BY etapa`,
      [inicio, fim, now],
    );
    return rows;
  }

  /** Inícios de conversa por dia da semana e faixa de duas horas, no fuso de negócio (MET-A09). */
  async heatmap(
    inicio: string,
    fim: string,
    now: Date,
  ): Promise<Array<{ weekday: number; bucket: number; count: number }>> {
    const { rows } = await this.pool.query<{ weekday: number; bucket: number; count: number }>(
      `SELECT extract(dow FROM (c.inicio AT TIME ZONE '${BUSINESS_TZ}'))::int AS weekday,
              floor(extract(hour FROM (c.inicio AT TIME ZONE '${BUSINESS_TZ}')) / 2)::int AS bucket,
              count(*)::int AS count
         FROM conversa c
        WHERE c.inicio >= $1::timestamptz AND c.inicio < $2::timestamptz AND c.inicio <= $3
        GROUP BY 1, 2`,
      [inicio, fim, now],
    );
    return rows;
  }

  /** Agendamentos e confirmações por dia local da data de início (base da série de conclusão). */
  async dailyCompletion(
    inicio: string,
    fim: string,
    now: Date,
  ): Promise<Array<{ date: string; started: number; confirmed: number }>> {
    const { rows } = await this.pool.query<{ date: string; started: number; confirmed: number }>(
      `SELECT (c.inicio AT TIME ZONE '${BUSINESS_TZ}')::date::text AS date,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM evento_conversa s WHERE s.id_conversa = c.id_conversa
                   AND s.tipo = 'STARTED_SCHEDULING' AND s.instante <= $3))::int AS started,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM evento_conversa s WHERE s.id_conversa = c.id_conversa
                   AND s.tipo = 'STARTED_SCHEDULING' AND s.instante <= $3)
              AND EXISTS (
                SELECT 1 FROM evento_conversa s WHERE s.id_conversa = c.id_conversa
                   AND s.tipo = 'APPOINTMENT_CONFIRMED' AND s.instante <= $3))::int AS confirmed
         FROM conversa c
        WHERE c.inicio >= $1::timestamptz AND c.inicio < $2::timestamptz AND c.inicio <= $3
        GROUP BY 1`,
      [inicio, fim, now],
    );
    return rows;
  }

  /** Ocorrências de busca sem horário por especialidade, em ordem decrescente (MET-A11). */
  async searchesBySpecialty(
    inicio: string,
    fim: string,
    now: Date,
  ): Promise<Array<{ id: number; name: string; count: number }>> {
    const { rows } = await this.pool.query<{ id: number; name: string; count: number }>(
      `SELECT e.id_especialidade AS id, e.nome_especialidade AS name, count(*)::int AS count
         FROM busca_sem_horario b
         JOIN especialidade e ON e.id_especialidade = b.id_especialidade
        WHERE b.instante >= $1::timestamptz AND b.instante < $2::timestamptz AND b.instante <= $3
        GROUP BY e.id_especialidade, e.nome_especialidade
        ORDER BY count(*) DESC, e.id_especialidade ASC`,
      [inicio, fim, now],
    );
    return rows;
  }
}
