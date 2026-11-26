import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

interface Schema {
  [key: string]: unknown;
}

interface MediaType {
  schema: Schema;
  examples?: Record<string, { value: unknown }>;
}

interface DocumentedResponse {
  headers: Record<string, { schema: Schema }>;
  content: { 'application/json': MediaType };
}

interface Operation {
  operationId: string;
  responses: Record<string, DocumentedResponse>;
  requestBody?: { content: { 'application/json': MediaType } };
}

export interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
}

/** Resolve referências locais como um consumidor externo, sem depender do bundle gerado no build. */
export function loadOpenApi(): OpenApiDocument {
  const documents = new Map<string, unknown>();
  function resolve(value: unknown, file: string): unknown {
    if (Array.isArray(value)) return value.map((item) => resolve(item, file));
    if (typeof value !== 'object' || value === null) return value;
    const record = value as Record<string, unknown>;
    if (typeof record.$ref === 'string') {
      const [target, fragment = ''] = record.$ref.split('#');
      const targetFile = target ? path.resolve(path.dirname(file), target) : file;
      if (!documents.has(targetFile)) {
        documents.set(targetFile, parse(readFileSync(targetFile, 'utf8')));
      }
      let referenced = documents.get(targetFile);
      for (const part of fragment.split('/').slice(1)) {
        const key = decodeURIComponent(part).replaceAll('~1', '/').replaceAll('~0', '~');
        referenced = (referenced as Record<string, unknown> | undefined)?.[key];
      }
      if (referenced === undefined) throw new Error(`Referência inexistente: ${record.$ref}`);
      return resolve(referenced, targetFile);
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, resolve(item, file)]),
    );
  }
  const root = path.resolve('docs/openapi/openapi.yaml');
  documents.set(root, parse(readFileSync(root, 'utf8')));
  return resolve(documents.get(root), root) as OpenApiDocument;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

export function assertSchema(schema: Schema, value: unknown, label: string): void {
  const validate = ajv.compile(schema);
  if (!validate(value)) throw new Error(`${label}: ${ajv.errorsText(validate.errors)}`);
}

export const openapi = loadOpenApi();

export function findOperation(method: string, url: string): Operation {
  const pathname = new URL(url, 'http://localhost').pathname;
  const entry = Object.entries(openapi.paths).find(([template]) => {
    const pattern = template.split('/').map((part) => (part.startsWith('{') ? '[^/]+' : part));
    return new RegExp(`^${pattern.join('/')}$`).test(pathname);
  });
  const operation = entry?.[1][method.toLowerCase()];
  if (!operation) throw new Error(`Operação não documentada: ${method} ${pathname}`);
  return operation;
}

/** Compara o JSON e os cabeçalhos reais com o contrato da operação e do status devolvido. */
export function assertOpenApiResponse(
  method: string,
  url: string,
  status: number,
  body: unknown,
  headers: Record<string, string>,
): void {
  const response = findOperation(method, url).responses[String(status)];
  const label = `${method} ${url} → ${status}`;
  if (!response) throw new Error(`Status não documentado: ${label}`);
  assertSchema(response.content['application/json'].schema, body, label);
  for (const [name, header] of Object.entries(response.headers)) {
    const value = headers[name.toLowerCase()];
    if (value === undefined) throw new Error(`${label}: cabeçalho ausente ${name}`);
    assertSchema(header.schema, value, `${label}: ${name}`);
  }
}
