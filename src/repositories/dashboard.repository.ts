import type { Pool } from 'pg';
import type { HourCount } from '../services/dashboard-summary';

export interface ClinicIdentity {
  id: number;
  name: string;
}

export interface MonthlyDashboardData {
  appointments: { total: number; complete: number; pending: number; cancelled: number };
  bestDay: { date: string; appointmentCount: number } | null;
  bestRoom: { id: number; name: string; appointmentCount: number } | null;
  hourlyCounts: HourCount[];
}

export interface UpcomingAppointment {
  id: number;
  status: 'pending';
  startsAt: Date;
  endsAt: Date;
  patient: { id: number; name: string };
  specialty: { id: number; name: string };
  doctor: { id: number; name: string };
  room: { id: number; name: string };
}

/** Read-only SQL for the Home dashboard. All dates and hours are grouped in clinic local time. */
export class DashboardRepository {
  constructor(private readonly pool: Pool) {}

  async clinic(): Promise<ClinicIdentity | null> {
    const { rows } = await this.pool.query<{ id: number; name: string }>(
      'SELECT id_clinica AS id, nome AS name FROM clinica ORDER BY id_clinica LIMIT 1',
    );
    return rows[0] ?? null;
  }

  async monthly(start: string, end: string, now: Date): Promise<MonthlyDashboardData> {
    const [totals, days, hours, rooms] = await Promise.all([
      this.pool.query<{ total: number; complete: number; pending: number; cancelled: number }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE r.cancelada_em IS NULL AND h.fim <= $3)::int AS complete,
                count(*) FILTER (WHERE r.cancelada_em IS NULL AND h.fim > $3)::int AS pending,
                count(*) FILTER (WHERE r.cancelada_em IS NOT NULL)::int AS cancelled
           FROM reserva r
           JOIN horario h ON h.id_horario = r.id_horario
          WHERE (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= $1::date
            AND (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date < $2::date`,
        [start, end, now],
      ),
      this.pool.query<{ date: string; count: number }>(
        `SELECT (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date::text AS date,
                count(*)::int AS count
           FROM reserva r JOIN horario h ON h.id_horario = r.id_horario
          WHERE (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= $1::date
            AND (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date < $2::date
          GROUP BY 1 ORDER BY count(*) DESC, date ASC LIMIT 1`,
        [start, end],
      ),
      this.pool.query<{ hour: number; count: number }>(
        `SELECT extract(hour FROM (h.inicio AT TIME ZONE 'America/Sao_Paulo'))::int AS hour,
                count(*)::int AS count
           FROM reserva r JOIN horario h ON h.id_horario = r.id_horario
          WHERE (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= $1::date
            AND (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date < $2::date
          GROUP BY 1 ORDER BY 1`,
        [start, end],
      ),
      this.pool.query<{ id: number; name: string; count: number }>(
        `SELECT s.id_sala AS id, s.nome AS name, count(*)::int AS count
           FROM reserva r
           JOIN horario h ON h.id_horario = r.id_horario
           JOIN sala s ON s.id_sala = h.id_sala
          WHERE (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= $1::date
            AND (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date < $2::date
          GROUP BY s.id_sala, s.nome
          ORDER BY count(*) DESC, s.id_sala ASC LIMIT 1`,
        [start, end],
      ),
    ]);

    const total = totals.rows[0]!;
    const day = days.rows[0];
    const room = rooms.rows[0];
    return {
      appointments: {
        total: total.total,
        complete: total.complete,
        pending: total.pending,
        cancelled: total.cancelled,
      },
      bestDay: day ? { date: day.date, appointmentCount: day.count } : null,
      bestRoom: room
        ? { id: room.id, name: room.name, appointmentCount: room.count }
        : null,
      hourlyCounts: hours.rows.map(({ hour, count }) => ({ hour, appointmentCount: count })),
    };
  }

  /** Distinct integer hours touched by the clinic's weekly opening intervals. */
  async businessHours(): Promise<number[]> {
    const { rows } = await this.pool.query<{ hour: number }>(
      `SELECT DISTINCT faixa.hora::int AS hour
         FROM expediente e
         CROSS JOIN LATERAL generate_series(
           extract(hour FROM e.abertura)::int,
           ceil(extract(epoch FROM e.fechamento) / 3600)::int - 1
         ) AS faixa(hora)
        WHERE e.abertura IS NOT NULL AND e.fechamento IS NOT NULL
        ORDER BY 1`,
    );
    return rows.map((row) => row.hour);
  }

  async attendanceDurations(
    currentStart: string,
    currentEnd: string,
    previousStart: string,
    previousEnd: string,
    now: Date,
  ): Promise<{ current: number[]; previous: number[] }> {
    const { rows } = await this.pool.query<{
      period: 'current' | 'previous';
      seconds: number;
    }>(
      `WITH first_confirmation AS (
         SELECT id_conversa, min(instante) AS confirmed_at
           FROM evento_conversa
          WHERE tipo = 'APPOINTMENT_CONFIRMED' AND instante <= $5
          GROUP BY id_conversa
       ), samples AS (
         SELECT CASE
                  WHEN (c.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= $1::date
                   AND (c.inicio AT TIME ZONE 'America/Sao_Paulo')::date < $2::date THEN 'current'
                  ELSE 'previous'
                END AS period,
                greatest(0, extract(epoch FROM (fc.confirmed_at - c.inicio)))::float8 AS seconds
           FROM conversa c
           JOIN first_confirmation fc ON fc.id_conversa = c.id_conversa
          WHERE c.inicio <= $5
            AND (
              ((c.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= $1::date
               AND (c.inicio AT TIME ZONE 'America/Sao_Paulo')::date < $2::date)
              OR
              ((c.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= $3::date
               AND (c.inicio AT TIME ZONE 'America/Sao_Paulo')::date < $4::date)
            )
       )
       SELECT period, seconds::float8 AS seconds FROM samples ORDER BY period, seconds`,
      [currentStart, currentEnd, previousStart, previousEnd, now],
    );
    return {
      current: rows.filter((row) => row.period === 'current').map((row) => row.seconds),
      previous: rows.filter((row) => row.period === 'previous').map((row) => row.seconds),
    };
  }

  async upcoming(now: Date): Promise<UpcomingAppointment[]> {
    const { rows } = await this.pool.query<{
      id: number;
      starts_at: Date;
      ends_at: Date;
      patient_id: number;
      patient_name: string;
      specialty_id: number;
      specialty_name: string;
      doctor_id: number;
      doctor_name: string;
      room_id: number;
      room_name: string;
    }>(
      `SELECT r.id_reserva AS id, h.inicio AS starts_at, h.fim AS ends_at,
              p.id_paciente AS patient_id, p.nome AS patient_name,
              e.id_especialidade AS specialty_id, e.nome_especialidade AS specialty_name,
              m.id_medico AS doctor_id, m.nome_medico AS doctor_name,
              s.id_sala AS room_id, s.nome AS room_name
         FROM reserva r
         JOIN horario h ON h.id_horario = r.id_horario
         JOIN paciente p ON p.id_paciente = r.id_paciente
         JOIN medico m ON m.id_medico = h.id_medico
         JOIN especialidade e ON e.id_especialidade = m.id_especialidade
         JOIN sala s ON s.id_sala = h.id_sala
        WHERE r.cancelada_em IS NULL AND h.inicio > $1
        ORDER BY h.inicio ASC, r.id_reserva ASC
        LIMIT 5`,
      [now],
    );
    return rows.map((row) => ({
      id: row.id,
      status: 'pending' as const,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      patient: { id: row.patient_id, name: row.patient_name },
      specialty: { id: row.specialty_id, name: row.specialty_name },
      doctor: { id: row.doctor_id, name: row.doctor_name },
      room: { id: row.room_id, name: row.room_name },
    }));
  }
}
