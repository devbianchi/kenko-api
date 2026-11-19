import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type { DashboardService } from '../services/dashboard.service';
import type { Clock } from '../shared/clock';
import { envelope } from '../shared/envelope';

function parseMonth(value: unknown): string {
  if (value === undefined) {
    throw new AppError('MISSING_PARAMETER', 'Parâmetro obrigatório ausente.', {
      month: 'Obrigatório.',
    });
  }
  if (
    typeof value !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
    value.startsWith('0000-')
  ) {
    throw new AppError('INVALID_MONTH', 'Mês inválido.', { month: 'Formato inválido.' });
  }
  return value;
}

export class DashboardController {
  constructor(
    private readonly service: DashboardService,
    private readonly clock: Clock,
  ) {}

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(envelope(await this.service.get(parseMonth(req.query.month)), this.clock));
  };
}
