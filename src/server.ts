import { buildApp } from './app';
import { corsOrigins, loadEnv } from './config/env';
import { createPool } from './config/database';
import { systemClock } from './shared/clock';

const env = loadEnv();
const pool = createPool(env.DATABASE_URL);

const app = buildApp({
  pool,
  clock: systemClock,
  corsOrigins: corsOrigins(env),
});

app.listen(env.PORT, () => {
  console.log(`Servidor rodando em http://localhost:${env.PORT}`);
});
