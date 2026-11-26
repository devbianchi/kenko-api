import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/errors/error-codes';
import { assertSchema, openapi } from '../support/openapi';

describe('especificação OpenAPI publicada separadamente', () => {
  it('documenta todas as rotas montadas pela aplicação, sem inventar operações', () => {
    const root = readFileSync('src/routes/index.ts', 'utf8');
    const routes: string[] = [];
    const mounts = root.matchAll(/router\.use\('([^']+)', (create\w+Router)\(/g);
    for (const [, prefix, factory] of mounts) {
      const imported = new RegExp(`import \\{ ${factory} \\} from '([^']+)'`).exec(root);
      expect(imported, `Import de ${factory}`).not.toBeNull();
      const source = readFileSync(`src/routes/${imported![1]!.replace('./', '')}.ts`, 'utf8');
      for (const [, method, suffix] of source.matchAll(
        /router\.(get|post|put|patch|delete|options|head)\('([^']+)'/g,
      )) {
        const route = `/api${prefix}${suffix === '/' ? '' : suffix}`.replace(/:(\w+)/g, '{$1}');
        routes.push(`${method} ${route}`);
      }
    }
    const app = readFileSync('src/app.ts', 'utf8');
    for (const [, method, route] of app.matchAll(
      /app\.(get|post|put|patch|delete|options|head)\('([^']+)'/g,
    )) {
      routes.push(`${method} ${route}`);
    }
    const documented = Object.entries(openapi.paths).flatMap(([route, item]) =>
      Object.keys(item)
        .filter((method) =>
          ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method),
        )
        .map((method) => `${method} ${route}`),
    );
    expect(documented.sort()).toEqual(routes.sort());
    const ids = Object.values(openapi.paths).flatMap((item) =>
      Object.values(item).map((op) => op.operationId),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mantém o catálogo de códigos sincronizado com o código de produção', () => {
    expect(openapi.components.schemas.ErrorCode?.enum).toEqual(Object.keys(ERROR_CODES));
    const responseCodes = new Set<string>();
    for (const item of Object.values(openapi.paths)) {
      for (const operation of Object.values(item)) {
        for (const [status, response] of Object.entries(operation.responses)) {
          const media = response.content['application/json'];
          for (const example of Object.values(media.examples ?? {})) {
            const body = example.value as { error?: { code: keyof typeof ERROR_CODES } };
            if (body.error) {
              responseCodes.add(body.error.code);
              expect(ERROR_CODES[body.error.code], body.error.code).toBe(Number(status));
            }
          }
        }
      }
    }
    expect([...responseCodes].sort()).toEqual(Object.keys(ERROR_CODES).sort());
  });

  it('valida todos os exemplos de requisição e resposta contra seus schemas', () => {
    for (const item of Object.values(openapi.paths)) {
      for (const operation of Object.values(item)) {
        const mediaTypes = Object.values(operation.responses).map(
          (r) => r.content['application/json'],
        );
        if (operation.requestBody)
          mediaTypes.push(operation.requestBody.content['application/json']);
        for (const media of mediaTypes) {
          for (const [name, example] of Object.entries(media.examples ?? {})) {
            assertSchema(media.schema, example.value, `${operation.operationId}: ${name}`);
          }
        }
      }
    }
  });

  it('rejeita regressões de estrutura, nullabilidade e discriminação nas respostas', () => {
    expect(() =>
      assertSchema(openapi.components.schemas.Day!, { date: '2026-11-10' }, 'dia incompleto'),
    ).toThrow();
    expect(() =>
      assertSchema(
        openapi.components.schemas.View!,
        { type: 'slots', options: [] },
        'view inválida',
      ),
    ).toThrow();
    expect(() =>
      assertSchema(
        openapi.components.schemas.SlotUnavailable!,
        { error: { code: 'SLOT_UNAVAILABLE', message: 'Conflito' } },
        'conflito sem estado',
      ),
    ).toThrow();
    expect(() =>
      assertSchema(
        openapi.components.schemas.AppointmentCounts!,
        { total: null, complete: 0, pending: 0, cancelled: 0 },
        'contagem nula',
      ),
    ).toThrow();
  });
});
