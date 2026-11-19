import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/app-error';
import { classifyError, describeErrorForLog } from '../../src/middlewares/error-handler';
import { isValidRequestId } from '../../src/middlewares/request-id';

function comCodigo(code: string, message = 'falha'): Error {
  return Object.assign(new Error(message), { code });
}

describe('classificação de erros', () => {
  it('mantém o status e o código do AppError e leva os campos', () => {
    expect(
      classifyError(new AppError('INVALID_NAME', 'Nome inválido.', { name: 'vazio' })),
    ).toEqual({
      status: 400,
      code: 'INVALID_NAME',
      message: 'Nome inválido.',
      fields: { name: 'vazio' },
    });
  });

  it('responde 503 para banco indisponível, pelo código de rede ou do PostgreSQL', () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', '57P01', '57P03', '53300']) {
      expect(classifyError(comCodigo(code)).code).toBe('SERVICE_UNAVAILABLE');
    }
  });

  it('responde 413 para corpo grande e 400 para JSON inválido, pelos tipos do body-parser', () => {
    expect(
      classifyError(Object.assign(new Error('x'), { type: 'entity.too.large' })),
    ).toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
    expect(
      classifyError(Object.assign(new Error('x'), { type: 'entity.parse.failed' })),
    ).toMatchObject({
      status: 400,
      code: 'INVALID_JSON',
    });
  });

  it('responde 500 genérico para qualquer outro erro, sem repetir a mensagem interna', () => {
    const outcome = classifyError(new Error('SELECT falhou para contato 5511999999999'));
    expect(outcome).toEqual({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Erro interno. Tente novamente.',
    });
    expect(JSON.stringify(outcome)).not.toContain('5511999999999');
  });
});

describe('descrição do erro para log', () => {
  it('não inclui a mensagem, porque ela pode trazer valores de entrada', () => {
    const erro = new Error('Key (contato)=(5511999999999) already exists');
    const descricao = describeErrorForLog(erro);
    expect(descricao.errorName).toBe('Error');
    expect(JSON.stringify(descricao)).not.toContain('5511999999999');
    expect(descricao.origin).toMatch(/^at /);
  });

  it('informa o código do erro quando existe e aceita valores que não são erros', () => {
    expect(describeErrorForLog(comCodigo('42P01')).errorCode).toBe('42P01');
    expect(describeErrorForLog('texto solto')).toEqual({
      errorName: 'UnknownError',
      errorCode: null,
      origin: null,
    });
  });
});

describe('identificador de requisição', () => {
  it('aceita identificadores curtos e seguros e recusa os demais', () => {
    expect(isValidRequestId('abc-123_x.y')).toBe(true);
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId('a'.repeat(65))).toBe(false);
    expect(isValidRequestId('com espaço')).toBe(false);
    expect(isValidRequestId('linha\nquebra')).toBe(false);
  });
});
