import type { Pool, PoolClient } from 'pg';
import type {
  AppointmentView,
  ClinicInformation,
  ConversationView,
  ViewContext,
} from '../models/conversation.model';
import type { AttemptRepository } from '../repositories/attempt.repository';
import type { ClinicRepository } from '../repositories/clinic.repository';
import type { ReservationRepository } from '../repositories/reservation.repository';
import type { RoteiroRepository } from '../repositories/roteiro.repository';
import type { SlotRepository } from '../repositories/slot.repository';
import { toAppointmentView } from './appointment-view';
import { groupOpeningHours } from './opening-hours';
import { encodeId } from '../shared/opaque-id';

type Db = Pool | PoolClient;

/**
 * Monta a interface atual de cada passo. A tela de horários e a lista de reservas são reconstruídas
 * a partir do estado gravado: reexibir não executa nova busca nem muda nada.
 */
export class ConversationViewBuilder {
  constructor(
    private readonly pool: Pool,
    private readonly roteiro: RoteiroRepository,
    private readonly clinics: ClinicRepository,
    private readonly slots: SlotRepository,
    private readonly attempts: AttemptRepository,
    private readonly reservations: ReservationRepository,
  ) {}

  async build(step: string, ctx: ViewContext, db: Db = this.pool): Promise<ConversationView> {
    if (step === 'closed') return { type: 'closed' };

    if (step === 'specialty') {
      return { type: 'options', options: await this.specialtyOptions(db) };
    }

    if (step === 'slot_selection') {
      const slots = ctx.attemptId === null ? [] : await this.slots.findOffered(ctx.attemptId, db);
      return { type: 'slots', searchResult: 'available', slots };
    }

    if (step === 'patient_data') {
      const selecionado =
        ctx.attemptId === null ? null : await this.selectedSlot(ctx.attemptId, db);
      return {
        type: 'patient_form',
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'birthDate', type: 'date', required: true },
        ],
        selectedSlot: selecionado,
      };
    }

    if (step === 'continue_after_no_slots') {
      const options = await this.roteiro.findOptions(step, db);
      return { type: 'options', options, searchResult: 'no_slots' };
    }

    if (step === 'appointments') {
      const reservas = await this.reservations.findByConversation(ctx.conversationId, db);
      const appointments: AppointmentView[] = reservas.map((r) =>
        toAppointmentView(r, ctx.agora, ctx.ativa),
      );
      return {
        type: 'appointments',
        appointments,
        options: await this.roteiro.findOptions(step, db),
      };
    }

    if (step === 'clinic_information') {
      return {
        type: 'clinic_information',
        clinic: await this.clinicInformation(db),
        options: await this.roteiro.findOptions(step, db),
      };
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

  private async selectedSlot(attemptId: number, db: Db) {
    const idHorario = await this.attempts.findSelectedSlot(attemptId, db);
    return idHorario === null ? null : this.slots.findOne(idHorario, db);
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

  private async clinicInformation(db: Db): Promise<ClinicInformation | null> {
    const clinica = await this.clinics.findFirst(db);
    if (!clinica) return null;
    const [dias, especialidades] = await Promise.all([
      this.clinics.findSchedule(clinica.id, db),
      this.clinics.findSpecialties(clinica.id, db),
    ]);
    return {
      id: encodeId('clinic', clinica.id),
      name: clinica.name,
      address: clinica.address,
      phone: clinica.phone,
      openingHours: groupOpeningHours(dias),
      specialties: especialidades.map((e) => ({ id: encodeId('sp', e.id), name: e.name })),
    };
  }
}
