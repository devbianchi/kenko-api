import type { Pool, PoolClient } from 'pg';
import type { ClinicRecord, DaySchedule, SpecialtyRecord } from '../models/clinic.model';

interface ClinicRow {
  id_clinica: number;
  nome: string;
  endereco: string;
  telefone: string;
}

interface ScheduleRow {
  dia_semana: number;
  abertura: string | null;
  fechamento: string | null;
}

interface SpecialtyRow {
  id_especialidade: number;
  nome_especialidade: string;
}

/** Única camada que fala com as tabelas da clínica. SQL parametrizado, sem ORM (ADR-0002). */
export class ClinicRepository {
  constructor(private readonly pool: Pool) {}

  async findFirst(db: Pool | PoolClient = this.pool): Promise<ClinicRecord | null> {
    const { rows } = await db.query<ClinicRow>(
      'SELECT id_clinica, nome, endereco, telefone FROM clinica ORDER BY id_clinica LIMIT 1',
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id_clinica,
      name: row.nome,
      address: row.endereco,
      phone: row.telefone,
    };
  }

  async findSchedule(clinicId: number, db: Pool | PoolClient = this.pool): Promise<DaySchedule[]> {
    const { rows } = await db.query<ScheduleRow>(
      `SELECT dia_semana, abertura, fechamento
         FROM expediente
        WHERE id_clinica = $1
        ORDER BY dia_semana`,
      [clinicId],
    );
    return rows.map((row) => ({
      weekday: row.dia_semana,
      opensAt: row.abertura,
      closesAt: row.fechamento,
    }));
  }

  async findSpecialties(
    clinicId: number,
    db: Pool | PoolClient = this.pool,
  ): Promise<SpecialtyRecord[]> {
    const { rows } = await db.query<SpecialtyRow>(
      `SELECT id_especialidade, nome_especialidade
         FROM especialidade
        WHERE id_clinica = $1
        ORDER BY id_especialidade`,
      [clinicId],
    );
    return rows.map((row) => ({ id: row.id_especialidade, name: row.nome_especialidade }));
  }
}
