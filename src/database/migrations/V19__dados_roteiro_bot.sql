-- Roteiro do bot: passos e opções fixos do produto. Não é dado de demonstração,
-- por isso fica em migration e não em seed (ADR-0009, ADR-0011).
-- A opção de especialidade é um modelo: o backend gera uma opção por especialidade
-- cadastrada, lendo a tabela especialidade.

ALTER TABLE opcao_roteiro ADD COLUMN codigo_opcao VARCHAR(40);

INSERT INTO passo_roteiro (codigo_passo, etapa, texto) VALUES
    ('menu',                     'menu',               'Como posso ajudar você hoje?'),
    ('specialty',                'triage',             'Qual especialidade você procura?'),
    ('visit_kind',               'triage',             'É uma primeira consulta ou um retorno?'),
    ('slot_selection',           'slot_selection',     'Escolha um dos horários disponíveis:'),
    ('continue_after_no_slots',  'slot_selection',     'Não há horários disponíveis para essa especialidade agora.'),
    ('patient_data',             'patient_data',       'Para confirmar, informe o nome completo e a data de nascimento do paciente.'),
    ('confirmation',             'confirmation',       'Sua consulta foi confirmada.'),
    ('appointments',             'appointments',       'Estes são os agendamentos desta conversa.'),
    ('clinic_information',       'clinic_information', 'Estas são as informações da clínica.'),
    ('closed',                   'closed',             'Obrigado por usar o atendimento. Até logo!');

INSERT INTO opcao_roteiro (id_passo, id_passo_destino, codigo_opcao, rotulo, acao) VALUES
    ((SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'menu'),
     (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'specialty'),
     'opt_schedule', 'Agendar uma consulta', 'schedule'),
    ((SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'menu'),
     (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'clinic_information'),
     'opt_clinic_info', 'Ver informações da clínica', 'clinic_info'),
    ((SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'menu'),
     (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'appointments'),
     'opt_appointments', 'Ver ou cancelar um agendamento', 'appointments'),
    ((SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'specialty'),
     (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'visit_kind'),
     'opt_specialty', 'Especialidade', 'select_specialty'),
    ((SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'visit_kind'),
     (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'slot_selection'),
     'opt_first_visit', 'Primeira consulta', 'select_visit_kind'),
    ((SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'visit_kind'),
     (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'slot_selection'),
     'opt_return', 'Retorno', 'select_visit_kind'),
    ((SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'continue_after_no_slots'),
     (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'menu'),
     'opt_continue', 'Continuar', 'go_menu'),
    ((SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'appointments'),
     (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'menu'),
     'opt_menu', 'Voltar ao menu', 'go_menu'),
    ((SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'clinic_information'),
     (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'menu'),
     'opt_menu', 'Voltar ao menu', 'go_menu');

ALTER TABLE opcao_roteiro ALTER COLUMN codigo_opcao SET NOT NULL;

ALTER TABLE opcao_roteiro
    ADD CONSTRAINT uq_opcao_roteiro_passo_codigo UNIQUE (id_passo, codigo_opcao);
