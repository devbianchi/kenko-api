/** Clínica como está no banco. O mapeamento para o contrato da API fica no controller. */
export interface ClinicRecord {
  id: number;
  name: string;
  address: string;
  phone: string;
}

/** Expediente de um dia da semana. Horários nulos significam dia fechado. */
export interface DaySchedule {
  weekday: number;
  opensAt: string | null;
  closesAt: string | null;
}

export interface SpecialtyRecord {
  id: number;
  name: string;
}

/** Item de openingHours do contrato: dias consecutivos com o mesmo horário, ou dias fechados. */
export type OpeningHoursItem =
  { weekdays: number[]; opensAt: string; closesAt: string } | { weekdays: number[]; closed: true };

/** Clínica pronta para a API: dados, horários agrupados e especialidades. */
export interface ClinicDetails extends ClinicRecord {
  openingHours: OpeningHoursItem[];
  specialties: SpecialtyRecord[];
}
