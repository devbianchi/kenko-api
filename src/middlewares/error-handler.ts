import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error';

function isJsonParseError(err: unknown): boolean {
  return err instanceof SyntaxError && (err as { type?: string }).type === 'entity.parse.failed';
}

function isDatabaseUnavailable(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === '57P01';
}

/** Envelope de erro: {error: {code, message, fields?}}. Detalhes internos ficam só no log. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    });
    return;
  }

  if (isJsonParseError(err)) {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'O corpo da requisição não é um JSON válido.' },
    });
    return;
  }

  if (isDatabaseUnavailable(err)) {
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Banco de dados indisponível. Tente novamente depois.',
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' },
  });
};
