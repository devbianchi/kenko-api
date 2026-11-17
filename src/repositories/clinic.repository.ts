import type { Pool } from 'pg';
import type { ClinicRecord } from '../models/clinic.model';

interface ClinicRow {
  id_clinica: number;
  nome: string;
  endereco: string;
  telefone: string;
}

/** Única camada que fala com a tabela clinica. SQL parametrizado, sem ORM (ADR-0002). */
export class ClinicRepository {
  constructor(private readonly pool: Pool) {}

  async findFirst(): Promise<ClinicRecord | null> {
    const { rows } = await this.pool.query<ClinicRow>(
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
}
