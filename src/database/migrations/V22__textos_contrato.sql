-- Textos do contrato (docs/especificacao/kenko-bot-api.md) no roteiro. Os trechos entre chaves são
-- preenchidos na hora da mensagem: {especialidade}, {data} e {hora}.

UPDATE passo_roteiro SET texto = 'Qual especialidade procura?' WHERE codigo_passo = 'specialty';
UPDATE passo_roteiro SET texto = 'É primeira consulta ou retorno em {especialidade}?' WHERE codigo_passo = 'visit_kind';
UPDATE passo_roteiro SET texto = 'Estes são os horários disponíveis.' WHERE codigo_passo = 'slot_selection';
UPDATE passo_roteiro SET texto = 'Não encontrei horários disponíveis. Deseja continuar?' WHERE codigo_passo = 'continue_after_no_slots';
UPDATE passo_roteiro SET texto = 'Informe nome e data de nascimento de quem será atendido.' WHERE codigo_passo = 'patient_data';
UPDATE passo_roteiro SET texto = 'Consulta confirmada para {data} às {hora}.' WHERE codigo_passo = 'confirmation';
UPDATE passo_roteiro SET texto = 'Veja as informações da clínica.' WHERE codigo_passo = 'clinic_information';
UPDATE passo_roteiro SET texto = 'Até logo!' WHERE codigo_passo = 'closed';

-- Mensagens sem passo próprio no roteiro: cancelamento e volta ao menu depois da confirmação.
INSERT INTO passo_roteiro (codigo_passo, etapa, texto) VALUES
    ('cancelled',    'appointments', 'Agendamento cancelado.'),
    ('back_to_menu', 'menu',         'Posso ajudar em mais alguma coisa?');

-- A tela de informações da clínica usa as opções do menu (contrato, 6.4), e não um passo próprio.
DELETE FROM opcao_roteiro
 WHERE id_passo = (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'clinic_information');
