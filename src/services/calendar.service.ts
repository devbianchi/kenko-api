import type { Pool } from 'pg';
import { dataLocal } from '../shared/datas';
import { encodeId } from '../shared/opaque-id';
import type { CalendarRepository, RoomCapacity } from '../repositories/calendar.repository';
import type { Clock } from '../shared/clock';
import { occupancyPercentage, peakHour, summarizeDay } from './calendar-summary';

export interface RoomDay {
  id: string;
  name: string;
  appointmentCount: number;
  cancelledCount: number;
  totalSlots: number;
  occupiedSlots: number;
  occupancyPercentage: number | null;
  peakHour: number | null;
}

/** Leituras do painel: calendário mensal e detalhe de uma data. Não altera nada. */
export class CalendarService {
  constructor(
    private readonly pool: Pool,
    private readonly calendar: CalendarRepository,
    private readonly clock: Clock,
  ) {}

  async countsByDate(inicio: string, fimExclusivo: string) {
    const counts = await this.calendar.countsByDate(inicio, fimExclusivo, this.pool);
    return { today: dataLocal(this.clock.now()), countsByDate: counts };
  }

  async day(data: string) {
    const consultas = await this.calendar.appointmentsOfDay(data, this.pool);
    const capacidades = await this.calendar.roomCapacityOfDay(data, this.pool);
    const agora = this.clock.now();

    const resumo = summarizeDay(consultas, agora);
    const rooms = capacidades.map((sala) => salaDoDia(sala, consultas));

    return {
      date: data,
      summary: {
        total: resumo.total,
        complete: resumo.complete,
        pending: resumo.pending,
        cancelled: resumo.cancelled,
        completionPercentage: resumo.completionPercentage,
      },
      appointmentsByHour: resumo.appointmentsByHour,
      appointmentsByDayPeriod: resumo.appointmentsByDayPeriod,
      rooms,
    };
  }
}

function salaDoDia(
  sala: RoomCapacity,
  consultas: { salaId: number; hora: number; canceladaEm: Date | null; fim: Date }[],
): RoomDay {
  const daSala = consultas.filter((c) => c.salaId === sala.salaId);
  return {
    id: encodeId('room', sala.salaId),
    name: sala.nome,
    appointmentCount: daSala.length,
    cancelledCount: daSala.filter((c) => c.canceladaEm !== null).length,
    totalSlots: sala.totalHorarios,
    occupiedSlots: sala.horariosOcupados,
    occupancyPercentage: occupancyPercentage(sala.horariosOcupados, sala.totalHorarios),
    peakHour: peakHour(daSala),
  };
}
