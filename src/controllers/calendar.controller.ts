import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type { CalendarService } from '../services/calendar.service';
import { dataExiste } from '../shared/datas';
import { envelope } from '../shared/envelope';
import type { Clock } from '../shared/clock';

/** Data obrigatória no formato AAAA-MM-DD, que existe no calendário. */
function parseData(valor: unknown, campo: string): string {
  if (valor === undefined) {
    throw new AppError('MISSING_PARAMETER', 'Parâmetro obrigatório ausente.', {
      [campo]: 'Obrigatório.',
    });
  }
  if (typeof valor !== 'string' || !dataExiste(valor)) {
    throw new AppError('INVALID_DATE', 'Data inválida.', { [campo]: 'Formato inválido.' });
  }
  return valor;
}

/** Adapta HTTP ao serviço de calendário: valida as datas e responde no envelope. */
export class CalendarController {
  constructor(
    private readonly service: CalendarService,
    private readonly clock: Clock,
  ) {}

  calendar = async (req: Request, res: Response): Promise<void> => {
    const inicio = parseData(req.query.startDate, 'startDate');
    const fim = parseData(req.query.endDateExclusive, 'endDateExclusive');
    if (inicio >= fim) {
      throw new AppError('INVALID_DATE_RANGE', 'Intervalo inválido.', {
        endDateExclusive: 'Deve ser posterior a startDate.',
      });
    }
    res.json(envelope(await this.service.countsByDate(inicio, fim), this.clock));
  };

  day = async (req: Request, res: Response): Promise<void> => {
    const data = parseData(req.params.date, 'date');
    res.json(envelope(await this.service.day(data), this.clock));
  };
}
