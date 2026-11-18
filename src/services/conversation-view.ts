import type { Pool, PoolClient } from 'pg';
import type { ConversationView } from '../models/conversation.model';
import type { ClinicRepository } from '../repositories/clinic.repository';
import type { RoteiroRepository } from '../repositories/roteiro.repository';
import type { SlotRepository } from '../repositories/slot.repository';
import { encodeId } from '../shared/opaque-id';

type Db = Pool | PoolClient;

/**
 * Monta a interface atual de cada passo. A tela de horários é reconstruída a partir dos horários já
 * oferecidos na tentativa: reexibir não executa nova busca (contrato, GET de conversa).
 */
export class ConversationViewBuilder {
  constructor(
    private readonly pool: Pool,
    private readonly roteiro: RoteiroRepository,
    private readonly clinics: ClinicRepository,
    private readonly slots: SlotRepository,
  ) {}

  async build(
    step: string,
    attemptId: number | null,
    db: Db = this.pool,
  ): Promise<ConversationView> {
    if (step === 'closed') return { type: 'closed' };

    if (step === 'specialty') {
      return { type: 'options', options: await this.specialtyOptions(db) };
    }

    if (step === 'slot_selection') {
      const slots = attemptId === null ? [] : await this.slots.findOffered(attemptId, db);
      return { type: 'slots', searchResult: 'available', slots };
    }

    if (step === 'continue_after_no_slots') {
      const options = await this.roteiro.findOptions(step, db);
      return { type: 'options', options, searchResult: 'no_slots' };
    }

    return { type: 'options', options: await this.roteiro.findOptions(step, db) };
  }

  /** Identificadores internos das especialidades da clínica, na ordem da tela. */
  async specialtyIds(db: Db = this.pool): Promise<number[]> {
    const clinica = await this.clinics.findFirst(db);
    if (!clinica) return [];
    const especialidades = await this.clinics.findSpecialties(clinica.id, db);
    return especialidades.map((especialidade) => especialidade.id);
  }

  private async specialtyOptions(db: Db) {
    const clinica = await this.clinics.findFirst(db);
    if (!clinica) return [];
    const especialidades = await this.clinics.findSpecialties(clinica.id, db);
    return especialidades.map((especialidade) => ({
      id: encodeId('sp', especialidade.id),
      label: especialidade.name,
    }));
  }
}
