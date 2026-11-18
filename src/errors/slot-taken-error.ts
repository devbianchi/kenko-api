/**
 * O horário foi reservado por outra conversa entre a oferta e a confirmação. A confirmação é
 * desfeita e o pipeline responde com SLOT_UNAVAILABLE e uma nova tela de horários.
 */
export class SlotTakenError extends Error {
  constructor() {
    super('Horário já reservado.');
    this.name = 'SlotTakenError';
  }
}
