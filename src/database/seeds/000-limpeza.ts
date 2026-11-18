// Remove a demonstração anterior. A trava do runner garante que a base só tem a clínica de demonstração,
// então tudo o que existe nela é dado de demonstração. Se alguma reserva real apontar para um horário
// da demonstração, a transação falha e nada é apagado.

/** Script SQL da demonstração, executado pelo runner dentro da transação de carga. */
export const sql = String.raw`
CREATE TEMP TABLE demo_conversas ON COMMIT DROP AS
    SELECT id_conversa, id_paciente
      FROM conversa
     WHERE contato LIKE 'demo\_%';

CREATE TEMP TABLE demo_pacientes ON COMMIT DROP AS
    SELECT DISTINCT id_paciente
      FROM demo_conversas
     WHERE id_paciente IS NOT NULL;

DELETE FROM evento_conversa   WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM busca_sem_horario WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM acao_processada   WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM interacao         WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM reserva           WHERE id_conversa_origem IN (SELECT id_conversa FROM demo_conversas);

UPDATE conversa
   SET id_paciente = NULL, id_tentativa_atual = NULL
 WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);

DELETE FROM tentativa WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM conversa  WHERE id_conversa IN (SELECT id_conversa FROM demo_conversas);
DELETE FROM paciente  WHERE id_paciente IN (SELECT id_paciente FROM demo_pacientes);

DELETE FROM horario;
DELETE FROM medico;
DELETE FROM sala;
DELETE FROM especialidade;
DELETE FROM expediente;
DELETE FROM clinica;
`;
