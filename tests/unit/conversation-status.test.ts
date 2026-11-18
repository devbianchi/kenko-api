import { describe, expect, it } from 'vitest';
import { effectiveStatus } from '../../src/services/conversation-status';

const ultima = new Date('2026-11-10T15:00:00Z');
const umaHoraDepois = (ms: number) => new Date(ultima.getTime() + 60 * 60 * 1000 + ms);

describe('effectiveStatus (VAL-12)', () => {
  it('considera ativa uma conversa com inatividade de exatamente uma hora', () => {
    expect(effectiveStatus({ closedAt: null, lastInteractionAt: ultima }, umaHoraDepois(0))).toBe(
      'active',
    );
  });

  it('considera abandonada a conversa com um segundo a mais de inatividade', () => {
    expect(
      effectiveStatus({ closedAt: null, lastInteractionAt: ultima }, umaHoraDepois(1000)),
    ).toBe('abandoned');
  });

  it('considera encerrada, e não abandonada, a conversa já encerrada por Sair', () => {
    expect(
      effectiveStatus(
        { closedAt: ultima, lastInteractionAt: ultima },
        umaHoraDepois(10 * 60 * 1000),
      ),
    ).toBe('closed');
  });

  it('considera ativa a conversa recém-criada', () => {
    expect(effectiveStatus({ closedAt: null, lastInteractionAt: ultima }, ultima)).toBe('active');
  });
});
