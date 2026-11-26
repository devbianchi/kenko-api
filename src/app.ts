import cors from 'cors';
import express from 'express';
import type { Pool } from 'pg';
import { createErrorHandler, routeNotFound } from './middlewares/error-handler';
import { requestId } from './middlewares/request-id';
import { createApiRouter } from './routes';
import type { Clock } from './shared/clock';
import type { DocsService } from './services/docs.service';

export interface AppDependencies {
  pool: Pool;
  clock: Clock;
  corsOrigins: string[];
  docs?: DocsService;
}

export function buildApp({ pool, clock, corsOrigins, docs }: AppDependencies): express.Express {
  const app = express();

  app.use(requestId);

  app.use(
    cors({
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
      // O frontend lê o X-Request-Id para mostrar junto do erro; sem isto, o navegador o esconde.
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', createApiRouter({ pool, clock, docs }));

  app.use(routeNotFound);
  app.use(createErrorHandler(clock));
  return app;
}
