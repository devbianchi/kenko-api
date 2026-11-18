import { AppError } from '../errors/app-error';
import type { ClinicDetails } from '../models/clinic.model';
import type { ClinicRepository } from '../repositories/clinic.repository';
import { groupOpeningHours } from './opening-hours';

/** Regras da clínica. Não conhece HTTP nem SQL. */
export class ClinicService {
  constructor(private readonly clinics: ClinicRepository) {}

  async getClinic(): Promise<ClinicDetails> {
    const clinic = await this.clinics.findFirst();
    if (!clinic) {
      throw new AppError('CLINIC_NOT_FOUND', 'Clínica não cadastrada.');
    }

    const [schedule, specialties] = await Promise.all([
      this.clinics.findSchedule(clinic.id),
      this.clinics.findSpecialties(clinic.id),
    ]);

    return {
      ...clinic,
      openingHours: groupOpeningHours(schedule),
      specialties,
    };
  }
}
