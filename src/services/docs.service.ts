import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// src/services e dist/services têm a mesma profundidade em relação à raiz do projeto.
export const OPENAPI_JSON_PATH = path.resolve(__dirname, '../../dist/openapi/openapi.json');

const documentSchema = z
  .object({
    openapi: z.literal('3.1.0'),
    info: z.object({ title: z.string().min(1), version: z.string().min(1) }).loose(),
    paths: z.record(z.string(), z.unknown()),
  })
  .loose();

/** Forma mínima verificada ao carregar; a validação completa da OpenAPI ocorre na geração e no CI. */
export type OpenApiDocument = z.infer<typeof documentSchema>;

/** Lê o bundle gerado no build uma vez por instância, sem banco e sem ferramentas de desenvolvimento no runtime. */
export class DocsService {
  private document: OpenApiDocument | undefined;

  constructor(private readonly filePath: string = OPENAPI_JSON_PATH) {}

  /** O servidor chama antes de escutar; a carga tardia mantém buildApp independente do disco nos demais testes. */
  getDocument(): OpenApiDocument {
    if (this.document) return this.document;
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      this.document = documentSchema.parse(parsed);
      return this.document;
    } catch (cause) {
      throw new Error(
        'Documento OpenAPI ausente ou inválido. Execute npm run docs:bundle ou npm run build antes de iniciar a API.',
        { cause },
      );
    }
  }
}
