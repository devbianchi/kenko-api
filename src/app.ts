import cors from 'cors';
import express from 'express';
import type { Pool } from 'pg';
import { errorHandler } from './middlewares/error-handler';
import { createApiRouter } from './routes';
import type { Clock } from './shared/clock';

export interface AppDependencies {
  pool: Pool;
  clock: Clock;
  corsOrigins: string[];
}

export function buildApp({ pool, clock, corsOrigins }: AppDependencies): express.Express {
  const app = express();

  app.use(
    cors({
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', createApiRouter({ pool, clock }));

  app.use(errorHandler);
  return app;
}
