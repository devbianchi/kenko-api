import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/** Aceita um X-Request-Id do cliente só se for curto e seguro para logs; caso contrário, gera um novo. */
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function isValidRequestId(value: string): boolean {
  return VALID_REQUEST_ID.test(value);
}

/** Define o identificador da requisição: devolve no cabeçalho e disponibiliza para logs e erros. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const id = incoming !== undefined && isValidRequestId(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
