import type { Request, Response } from 'express';
import type { DocsService } from '../services/docs.service';

/** Serve a OpenAPI diretamente: visualizadores e a página do frontend esperam o documento sem meta/data. */
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  get = (_req: Request, res: Response): void => {
    res.json(this.docs.getDocument());
  };
}
