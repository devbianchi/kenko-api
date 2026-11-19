// Remove a demonstração anterior. A trava do runner garante que a base só tem a clínica de demonstração,
// então tudo o que existe nela é dado de demonstração, inclusive as conversas e reservas criadas pelo
// bot durante uma apresentação (contatos que não começam com demo_). Limpar só o prefixo deixaria essas
// reservas apontando para horários que a carga precisa apagar.

/** Script SQL da demonstração, executado pelo runner dentro da transação de carga. */
export const sql = String.raw`
CREATE TEMP TABLE demo_conversas ON COMMIT DROP AS
    SELECT id_conversa, id_paciente
      FROM conversa;

DELETE FROM evento_conversa   WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM busca_sem_horario WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM acao_processada   WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM interacao         WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM reserva           WHERE id_conversa_origem IN (SELECT id_conversa FROM demo_conversas);

UPDATE conversa
   SET id_paciente = NULL, id_tentativa_atual = NULL
 WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);

DELETE FROM oferta_horario WHERE id_tentativa IN (SELECT id_tentativa FROM tentativa WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas));

DELETE FROM tentativa WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM conversa  WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM paciente;

DELETE FROM horario;
DELETE FROM medico;
DELETE FROM sala;
DELETE FROM especialidade;
DELETE FROM expediente;
DELETE FROM clinica;
`;
