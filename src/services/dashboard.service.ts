import { AppError } from '../errors/app-error';
import type { DashboardRepository } from '../repositories/dashboard.repository';
import type { Clock } from '../shared/clock';
import { toBusinessIso } from '../shared/business-time';
import { encodeId } from '../shared/opaque-id';
import { median, summarizePeakHour } from './dashboard-summary';

function monthBounds(month: string): { start: string; end: string; previousStart: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const start = `${month}-01`;
  const format = (targetYear: number, targetMonth: number) =>
    `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-01`;
  const end = monthNumber === 12 ? format(year + 1, 1) : format(year, monthNumber + 1);
  const previousStart = monthNumber === 1 ? format(year - 1, 12) : format(year, monthNumber - 1);
  return { start, end, previousStart };
}

/** Read-only monthly dashboard rules. */
export class DashboardService {
  constructor(
    private readonly dashboard: DashboardRepository,
    private readonly clock: Clock,
  ) {}

  async get(month: string) {
    const evaluatedAt = this.clock.now();
    const bounds = monthBounds(month);
    const previous = bounds.start;
    const [clinic, monthly, businessHours, durations, upcoming] = await Promise.all([
      this.dashboard.clinic(),
      this.dashboard.monthly(bounds.start, bounds.end, evaluatedAt),
      this.dashboard.businessHours(),
      this.dashboard.attendanceDurations(
        bounds.start,
        bounds.end,
        bounds.previousStart,
        previous,
        evaluatedAt,
      ),
      this.dashboard.upcoming(evaluatedAt),
    ]);

    if (!clinic) throw new AppError('CLINIC_NOT_FOUND', 'Clínica não cadastrada.');

    const currentSeconds = median(durations.current);
    const previousSeconds = median(durations.previous);
    const peak =
      monthly.appointments.total === 0
        ? null
        : summarizePeakHour(businessHours, monthly.hourlyCounts);

    return {
      clinic: { id: encodeId('clinic', clinic.id), name: clinic.name },
      appointments: monthly.appointments,
      bestDay: monthly.bestDay,
      peakHour: peak,
      bestRoom: monthly.bestRoom
        ? {
            ...monthly.bestRoom,
            id: encodeId('room', monthly.bestRoom.id),
          }
        : null,
      attendanceDuration: {
        statistic: 'median' as const,
        seconds: currentSeconds,
        previousSeconds,
        differenceSeconds:
          currentSeconds === null || previousSeconds === null
            ? null
            : currentSeconds - previousSeconds,
      },
      upcomingAppointments: upcoming.map((appointment) => ({
        id: encodeId('ap', appointment.id),
        status: appointment.status,
        startsAt: toBusinessIso(appointment.startsAt),
        endsAt: toBusinessIso(appointment.endsAt),
        patient: {
          id: encodeId('pt', appointment.patient.id),
          name: appointment.patient.name,
        },
        specialty: {
          id: encodeId('sp', appointment.specialty.id),
          name: appointment.specialty.name,
        },
        doctor: {
          id: encodeId('dr', appointment.doctor.id),
          name: appointment.doctor.name,
        },
        room: { id: encodeId('room', appointment.room.id), name: appointment.room.name },
      })),
    };
  }
}
