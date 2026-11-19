import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import type { ErrorCode } from '../errors/error-codes';
import type { Clock } from '../shared/clock';

/** Códigos de rede e do PostgreSQL que indicam banco indisponível (SQLSTATE 57P01, 57P03 e 53300). */
const DATABASE_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01',
  '57P03',
  '53300',
]);

export interface ClassifiedError {
  status: number;
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
}

/** Decide status e código do envelope de erro. Nada aqui inclui detalhe interno. */
export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof AppError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      ...(err.fields ? { fields: err.fields } : {}),
    };
  }

  const info = objectOf(err);
  if (info.type === 'entity.parse.failed' || info.type === 'entity.verify.failed') {
    return {
      status: 400,
      code: 'INVALID_JSON',
      message: 'O corpo da requisição não é um JSON válido.',
    };
  }
  if (info.type === 'entity.too.large') {
    return {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'O corpo da requisição é grande demais.',
    };
  }
  if (typeof info.code === 'string' && DATABASE_UNAVAILABLE_CODES.has(info.code)) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Banco de dados indisponível. Tente novamente depois.',
    };
  }
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Erro interno. Tente novamente.',
  };
}

/**
 * Descreve o erro para o log sem valores de entrada: nome, código e a primeira linha de origem da stack.
 * A mensagem não entra, porque erros do pg e de validação podem carregar contato, nome ou data.
 */
export function describeErrorForLog(err: unknown): {
  errorName: string;
  errorCode: string | null;
  origin: string | null;
} {
  const info = objectOf(err);
  const frame =
    typeof info.stack === 'string'
      ? info.stack.split('\n').find((line) => line.trimStart().startsWith('at '))
      : undefined;
  return {
    errorName: typeof info.name === 'string' ? info.name : 'UnknownError',
    errorCode: typeof info.code === 'string' ? info.code : null,
    origin: frame?.trim() ?? null,
  };
}

function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Envelope de erro: {error: {code, message, fields?}}. Erros de servidor são registrados em log com o requestId. */
export function createErrorHandler(clock: Clock): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const outcome = classifyError(err);
    if (outcome.status >= 500) {
      console.error(
        JSON.stringify({
          level: 'error',
          time: clock.now().toISOString(),
          requestId: res.locals.requestId ?? null,
          status: outcome.status,
          ...describeErrorForLog(err),
        }),
      );
    }

    res.status(outcome.status).json({
      error: {
        code: outcome.code,
        message: outcome.message,
        ...(outcome.fields ? { fields: outcome.fields } : {}),
      },
    });
  };
}

/** Rota que não existe em /api ou fora dela: responde no envelope de erro, não em HTML. */
export const routeNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: 'Rota não encontrada.' },
  });
};
