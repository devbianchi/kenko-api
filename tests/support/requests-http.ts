import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Express } from 'express';
import request from 'supertest';
import { toBusinessIso } from '../../src/shared/business-time';
import type { Clock } from '../../src/shared/clock';

/** Uma requisição do arquivo requests.http, já separada em partes. */
export interface HttpBlock {
  title: string;
  name: string | null;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  expectedStatus: number | null;
}

/** Lê o arquivo do REST Client e devolve as requisições na ordem em que aparecem. */
export function parseRequestsFile(path: string): {
  variables: Record<string, string>;
  blocks: HttpBlock[];
} {
  const text = readFileSync(path, 'utf8');
  const variables: Record<string, string> = {};
  for (const match of text.matchAll(/^@(\w+) = (.+)$/gm)) {
    variables[match[1]!] = match[2]!.trim();
  }

  const blocks: HttpBlock[] = [];
  const parts = text.split(/^### /m).slice(1);
  for (const part of parts) {
    const [titleLine, ...rest] = part.split('\n');
    const title = titleLine!.trim();
    const lines = rest;
    let name: string | null = null;
    let index = 0;
    while (index < lines.length && (lines[index]!.startsWith('#') || lines[index]!.trim() === '')) {
      const named = /^# @name (\w+)/.exec(lines[index]!);
      if (named) name = named[1]!;
      index += 1;
    }
    const requestLine = lines[index];
    if (requestLine === undefined || requestLine.startsWith('@') || requestLine.trim() === '')
      continue;
    const [method, ...urlParts] = requestLine.trim().split(' ');
    index += 1;

    const headers: Record<string, string> = {};
    while (index < lines.length && lines[index]!.trim() !== '') {
      const separator = lines[index]!.indexOf(':');
      headers[lines[index]!.slice(0, separator).trim()] = lines[index]!.slice(separator + 1).trim();
      index += 1;
    }
    const body = lines.slice(index).join('\n').trim();
    const statusMatch = /:\s*(\d{3})\b/.exec(title);
    blocks.push({
      title,
      name,
      method: method!,
      url: urlParts.join(' '),
      headers,
      body,
      expectedStatus: statusMatch ? Number(statusMatch[1]) : null,
    });
  }
  return { variables, blocks };
}

/** Data de hoje no fuso de negócio, somada a um deslocamento opcional, no formato pedido pelo REST Client. */
function localDatetime(clock: Clock, format: string, offset: number, unit: string): string {
  const [year, month, day] = toBusinessIso(clock.now()).slice(0, 10).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  let y = year;
  let m = month;
  let d = day;
  if (unit === 'y') y += offset;
  if (unit === 'M') m += offset;
  if (unit === 'd') d += offset;
  const date = new Date(Date.UTC(y, m - 1, d));
  const pad = (n: number) => String(n).padStart(2, '0');
  const parts = {
    YYYY: String(date.getUTCFullYear()),
    MM: pad(date.getUTCMonth() + 1),
    DD: pad(date.getUTCDate()),
  };
  return format.replace('YYYY', parts.YYYY).replace('MM', parts.MM).replace('DD', parts.DD);
}

/** Lê um caminho no estilo REST Client ($.data.specialties[2].id) em um corpo já parseado. */
function resolvePath(body: unknown, path: string): unknown {
  let current: unknown = body;
  for (const token of path.replace(/^\.?\$\.?/, '').match(/[^.[\]]+|\[\d+\]/g) ?? []) {
    if (current === null || current === undefined) throw new Error(`caminho ${path} não existe`);
    const index = /^\[(\d+)\]$/.exec(token);
    current = index
      ? (current as unknown[])[Number(index[1])]
      : (current as Record<string, unknown>)[token];
  }
  return current;
}

/** Substitui variáveis, $guid, $localDatetime e referências a respostas anteriores. */
export function substitute(
  value: string,
  variables: Record<string, string>,
  responses: Map<string, unknown>,
  clock: Clock,
): string {
  let result = value;
  for (let pass = 0; pass < 5; pass += 1) {
    result = result.replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => {
      const expression = raw.trim();
      if (expression === '$guid') return randomUUID();
      const dynamic = /^\$localDatetime '([^']+)'(?: (-?\d+) ([yMd]))?$/.exec(expression);
      if (dynamic) {
        return localDatetime(clock, dynamic[1]!, Number(dynamic[2] ?? 0), dynamic[3] ?? 'd');
      }
      const reference = /^(\w+)\.response\.body(\..+)$/.exec(expression);
      if (reference) {
        if (!responses.has(reference[1]!))
          throw new Error(`resposta ${reference[1]} ainda não foi enviada`);
        return String(resolvePath(responses.get(reference[1]!), reference[2]!));
      }
      if (expression in variables)
        return substitute(variables[expression]!, variables, responses, clock);
      throw new Error(`variável não resolvida: ${expression}`);
    });
  }
  return result;
}

export interface ExecutedRequest {
  title: string;
  status: number;
  body: unknown;
}

/** Executa as requisições na ordem do arquivo, contra a aplicação, e devolve o que cada uma recebeu. */
export async function runRequestsFile(
  app: Express,
  path: string,
  clock: Clock,
): Promise<ExecutedRequest[]> {
  const { variables, blocks } = parseRequestsFile(path);
  const scope: Record<string, string> = { ...variables, host: '' };
  const responses = new Map<string, unknown>();
  const executed: ExecutedRequest[] = [];

  for (const block of blocks) {
    const url = substitute(block.url, scope, responses, clock);
    const body = substitute(block.body, scope, responses, clock);
    const headers = Object.fromEntries(
      Object.entries(block.headers).map(([key, value]) => [
        key,
        substitute(value, scope, responses, clock),
      ]),
    );

    let call = request(app)[block.method.toLowerCase() as 'get' | 'post'](url);
    for (const [key, value] of Object.entries(headers)) call = call.set(key, value);
    const response = body ? await call.send(body) : await call;

    if (block.name) responses.set(block.name, response.body);
    executed.push({ title: block.title, status: response.status, body: response.body });

    const expected = block.expectedStatus ?? null;
    if (expected !== null && response.status !== expected) {
      throw new Error(`"${block.title}": esperado ${expected}, recebido ${response.status}`);
    }
    if (expected === null && (response.status < 200 || response.status >= 300)) {
      throw new Error(`"${block.title}": esperado 2xx, recebido ${response.status}`);
    }
  }
  return executed;
}
