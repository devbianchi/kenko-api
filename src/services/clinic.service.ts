import { AppError } from '../errors/app-error';
import type { ClinicRecord } from '../models/clinic.model';
import type { ClinicRepository } from '../repositories/clinic.repository';

/** Regras da clínica. Não conhece HTTP nem SQL. */
export class ClinicService {
  constructor(private readonly clinics: ClinicRepository) {}

  async getClinic(): Promise<ClinicRecord> {
    const clinic = await this.clinics.findFirst();
    if (!clinic) {
      throw new AppError('CLINIC_NOT_FOUND', 'Clínica não cadastrada.');
    }
    return clinic;
  }
}
