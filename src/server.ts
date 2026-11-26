import { buildApp } from './app';
import { corsOrigins, loadEnv } from './config/env';
import { createPool } from './config/database';
import { systemClock } from './shared/clock';
import { DocsService } from './services/docs.service';

const env = loadEnv();
const docs = new DocsService();
// Falha antes de abrir a porta se o artefato de documentação não acompanhou a entrega.
docs.getDocument();
const pool = createPool(env.DATABASE_URL);

const app = buildApp({
  pool,
  clock: systemClock,
  corsOrigins: corsOrigins(env),
  docs,
});

app.listen(env.PORT, () => {
  console.log(`Servidor rodando em http://localhost:${env.PORT}`);
});
