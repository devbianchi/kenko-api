import type { Request, Response } from 'express';
import type { Clock } from '../shared/clock';
import { encodeId } from '../shared/opaque-id';
import { envelope } from '../shared/envelope';
import type { ClinicService } from '../services/clinic.service';

/** Adapta HTTP ao serviço: lê a requisição, chama o serviço e responde com o envelope. */
export class ClinicController {
  constructor(
    private readonly service: ClinicService,
    private readonly clock: Clock,
  ) {}

  getClinic = async (_req: Request, res: Response): Promise<void> => {
    const clinic = await this.service.getClinic();
    res.json(
      envelope(
        {
          id: encodeId('clinic', clinic.id),
          name: clinic.name,
          address: clinic.address,
          phone: clinic.phone,
          openingHours: clinic.openingHours,
          specialties: clinic.specialties.map((s) => ({
            id: encodeId('sp', s.id),
            name: s.name,
          })),
        },
        this.clock,
      ),
    );
  };
}
