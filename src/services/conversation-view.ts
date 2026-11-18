import type { Pool, PoolClient } from 'pg';
import type { ConversationView } from '../models/conversation.model';
import type { ClinicRepository } from '../repositories/clinic.repository';
import type { RoteiroRepository } from '../repositories/roteiro.repository';
import { encodeId } from '../shared/opaque-id';

type Db = Pool | PoolClient;

/** Monta a interface atual de cada passo: opções do roteiro, especialidades da clínica ou horários. */
export class ConversationViewBuilder {
  constructor(
    private readonly roteiro: RoteiroRepository,
    private readonly clinics: ClinicRepository,
  ) {}

  async build(step: string, db?: Db): Promise<ConversationView> {
    if (step === 'closed') return { type: 'closed' };
    if (step === 'specialty') {
      return { type: 'options', options: await this.specialtyOptions(db) };
    }
    if (step === 'slot_selection') return { type: 'slots', slots: [] };
    return { type: 'options', options: await this.roteiro.findOptions(step, db) };
  }

  /** Identificadores internos das especialidades da clínica, na ordem da tela. */
  async specialtyIds(db?: Db): Promise<number[]> {
    const clinica = await this.clinics.findFirst(db);
    if (!clinica) return [];
    const especialidades = await this.clinics.findSpecialties(clinica.id, db);
    return especialidades.map((especialidade) => especialidade.id);
  }

  private async specialtyOptions(db?: Db) {
    const clinica = await this.clinics.findFirst(db);
    if (!clinica) return [];
    const especialidades = await this.clinics.findSpecialties(clinica.id, db);
    return especialidades.map((especialidade) => ({
      id: encodeId('sp', especialidade.id),
      label: especialidade.name,
    }));
  }
}
