import { ERROR_CODES, type ErrorCode } from './error-codes';

/** Erro de negócio ou de entrada. O status HTTP vem do catálogo, não é escolhido no ponto de uso. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: Record<string, string> | undefined;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code];
    this.fields = fields;
  }
}
