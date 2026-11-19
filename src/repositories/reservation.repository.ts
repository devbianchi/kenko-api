import type { Pool, PoolClient } from 'pg';
import { SlotTakenError } from '../errors/slot-taken-error';

type Db = Pool | PoolClient;

export const RESERVA_ATIVA_UNICA = 'uq_reserva_horario_ativa';

export interface ReservaDaConversa {
  id: number;
  canceladaEm: Date | null;
  inicio: Date;
  fim: Date;
  pacienteId: number;
  pacienteNome: string;
  especialidadeId: number;
  especialidadeNome: string;
  medicoId: number;
  medicoNome: string;
  salaId: number;
  salaNome: string;
}

interface ReservaRow {
  id: number;
  cancelada_em: Date | null;
  inicio: Date;
  fim: Date;
  id_paciente: number;
  paciente_nome: string;
  id_especialidade: number;
  nome_especialidade: string;
  id_medico: number;
  nome_medico: string;
  id_sala: number;
  nome_sala: string;
}

const SELECT_RESERVA = `
  SELECT r.id_reserva AS id, r.cancelada_em, h.inicio, h.fim,
         p.id_paciente, p.nome AS paciente_nome,
         e.id_especialidade, e.nome_especialidade,
         m.id_medico, m.nome_medico, s.id_sala, s.nome AS nome_sala
    FROM reserva r
    JOIN paciente p ON p.id_paciente = r.id_paciente
    JOIN horario h ON h.id_horario = r.id_horario
    JOIN medico m ON m.id_medico = h.id_medico
    JOIN especialidade e ON e.id_especialidade = m.id_especialidade
    JOIN sala s ON s.id_sala = h.id_sala`;

function toReserva(row: ReservaRow): ReservaDaConversa {
  return {
    id: row.id,
    canceladaEm: row.cancelada_em,
    inicio: row.inicio,
    fim: row.fim,
    pacienteId: row.id_paciente,
    pacienteNome: row.paciente_nome,
    especialidadeId: row.id_especialidade,
    especialidadeNome: row.nome_especialidade,
    medicoId: row.id_medico,
    medicoNome: row.nome_medico,
    salaId: row.id_sala,
    salaNome: row.nome_sala,
  };
}

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

  /** Reservas originadas na conversa, inclusive completas e canceladas, na ordem do horário. */
  async findByConversation(idConversa: number, db: Db): Promise<ReservaDaConversa[]> {
    const { rows } = await db.query<ReservaRow>(
      `${SELECT_RESERVA} WHERE r.id_conversa_origem = $1 ORDER BY h.inicio, r.id_reserva`,
      [idConversa],
    );
    return rows.map(toReserva);
  }

  /** Uma reserva pelo identificador, sem restringir à conversa: quem decide é o serviço. */
  async findById(
    idReserva: number,
    db: Db,
  ): Promise<(ReservaDaConversa & { idConversaOrigem: number }) | null> {
    const { rows } = await db.query<ReservaRow & { id_conversa_origem: number }>(
      `${SELECT_RESERVA.replace('SELECT r.id_reserva AS id,', 'SELECT r.id_reserva AS id, r.id_conversa_origem,')}
        WHERE r.id_reserva = $1`,
      [idReserva],
    );
    const row = rows[0];
    return row ? { ...toReserva(row), idConversaOrigem: row.id_conversa_origem } : null;
  }

  /** Marca a reserva como cancelada. Não apaga a confirmação nem o histórico (RN-18). */
  async cancel(idReserva: number, instante: Date, db: Db): Promise<void> {
    await db.query(
      `UPDATE reserva SET cancelada_em = $2 WHERE id_reserva = $1 AND cancelada_em IS NULL`,
      [idReserva, instante],
    );
  }
}
