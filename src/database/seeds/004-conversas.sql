-- Conversas da demonstração: 110 conversas em 60 dias antes da referência, com desfechos
-- fixos e determinísticos. Cada conversa é gerada por uma linha de `plano`, e a categoria
-- define eventos, tentativa, busca sem horário, paciente e reserva.
-- Categorias (n = número da conversa):
--   1–40 confirmou              41–50 confirmou e cancelou     51–53 consultou e agendou
--   54–61 escolheu e não confirmou  62–70 viu horários e saiu  71–75 abandonou após triagem
--   76–79 abandonou com dados     80–86 viu sem horários e saiu  87–104 só consultou
--   105–110 saiu no menu

CREATE TEMP TABLE plano ON COMMIT DROP AS
WITH ref AS (
    SELECT (current_setting('kenko.referencia')::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
),
base AS (
    SELECT s.n,
           ref.hoje - CASE
               WHEN s.n BETWEEN 1 AND 6   THEN 1
               WHEN s.n BETWEEN 13 AND 16 THEN 9
               ELSE 2 + ((s.n * 7) % 57)
           END AS base_dia
      FROM generate_series(1, 110) AS s(n)
      CROSS JOIN ref
),
dias AS (
    SELECT n, base_dia,
           CASE
               WHEN n = 80 THEN base_dia - extract(dow FROM base_dia)::int
               WHEN n = 81 THEN base_dia - ((extract(dow FROM base_dia)::int + 1) % 7)
               WHEN n = 82 THEN base_dia
               WHEN extract(dow FROM base_dia)::int = 0 THEN base_dia - 2
               ELSE base_dia
           END AS dia
      FROM base
),
horas AS (
    SELECT n, dia,
           dia::timestamp + CASE
               WHEN n = 80 THEN interval '10 hours'
               WHEN n = 81 THEN interval '15 hours'
               WHEN n = 82 THEN interval '6 hours 30 minutes'
               WHEN extract(dow FROM dia)::int = 6 THEN make_interval(hours => 9 + (n % 4))
               ELSE make_interval(hours => 8 + (n % 10))
           END AS inicio_local
      FROM dias
),
categorias AS (
    SELECT s.n,
           CASE
               WHEN s.n <= 40  THEN 'confirmou'
               WHEN s.n <= 50  THEN 'confirmou_cancelou'
               WHEN s.n <= 53  THEN 'consultou_agendou'
               WHEN s.n <= 61  THEN 'escolheu_nao_confirmou'
               WHEN s.n <= 70  THEN 'viu_horarios_saiu'
               WHEN s.n <= 75  THEN 'abandonou_triagem'
               WHEN s.n <= 79  THEN 'abandonou_dados'
               WHEN s.n <= 86  THEN 'viu_sem_horarios_saiu'
               WHEN s.n <= 104 THEN 'so_consultou'
               ELSE 'saiu_menu'
           END AS categoria
      FROM generate_series(1, 110) AS s(n)
),
base_plano AS (
    SELECT h.n, c.categoria,
           (h.inicio_local AT TIME ZONE 'America/Sao_Paulo') AS inicio,
           CASE WHEN c.categoria IN ('confirmou','confirmou_cancelou','consultou_agendou')
                THEN 1 + ((h.n * 7) % 12) END AS duracao_min
      FROM horas h
      JOIN categorias c ON c.n = h.n
)
SELECT b.n,
       'demo_conversa_' || lpad(b.n::text, 3, '0') AS contato,
       b.categoria,
       b.inicio,
       CASE WHEN b.duracao_min IS NOT NULL
            THEN b.inicio + make_interval(mins => b.duracao_min)
            ELSE b.inicio + interval '15 minutes' END AS fim,
       b.categoria IN ('confirmou','confirmou_cancelou','consultou_agendou') AS confirma,
       b.categoria = 'confirmou_cancelou' AS cancela,
       b.categoria IN ('viu_horarios_saiu','viu_sem_horarios_saiu','saiu_menu') AS sai,
       b.categoria IN ('confirmou','confirmou_cancelou','consultou_agendou','so_consultou') AS concluida,
       b.categoria IN ('escolheu_nao_confirmou','abandonou_triagem','abandonou_dados') AS abandona,
       b.categoria IN ('confirmou','confirmou_cancelou','consultou_agendou','escolheu_nao_confirmou',
                       'viu_horarios_saiu','abandonou_dados') AS busca_com_horario,
       b.categoria IN ('confirmou','confirmou_cancelou','consultou_agendou','escolheu_nao_confirmou',
                       'abandonou_dados') AS seleciona_horario,
       b.categoria IN ('confirmou','confirmou_cancelou','consultou_agendou','escolheu_nao_confirmou',
                       'abandonou_triagem','abandonou_dados','viu_horarios_saiu','viu_sem_horarios_saiu')
           AS iniciou_agendar,
       CASE WHEN b.categoria = 'escolheu_nao_confirmou' THEN 'slot_selection'
            WHEN b.categoria = 'abandonou_triagem'      THEN 'visit_kind'
            WHEN b.categoria = 'abandonou_dados'        THEN 'patient_data'
            WHEN b.categoria IN ('viu_horarios_saiu','viu_sem_horarios_saiu') THEN 'closed'
            WHEN b.categoria = 'saiu_menu'              THEN 'closed'
            ELSE 'menu' END AS id_passo_atual_codigo,
       CASE WHEN b.categoria IN ('viu_horarios_saiu','viu_sem_horarios_saiu') THEN 'exited'
            WHEN b.categoria = 'saiu_menu'            THEN 'exited'
            WHEN b.categoria IN ('confirmou','confirmou_cancelou','consultou_agendou','so_consultou')
                 THEN 'concluded'
            ELSE NULL END AS encerramento_motivo,
       CASE WHEN b.categoria IN ('viu_horarios_saiu','viu_sem_horarios_saiu') THEN 'slot_selection'
            WHEN b.categoria = 'saiu_menu'                                 THEN 'menu'
            WHEN b.categoria IN ('confirmou','confirmou_cancelou','consultou_agendou') THEN 'confirmation'
            WHEN b.categoria = 'so_consultou'                              THEN 'menu'
            ELSE NULL END AS encerramento_etapa,
       CASE WHEN b.n = 80 THEN 'Dermatologia'
            WHEN b.n IN (81, 82) THEN 'Dermatologia'
            WHEN b.n IN (83, 84) THEN 'Ortopedia'
            WHEN b.n = 85 THEN 'Cardiologia'
            WHEN b.n = 86 THEN 'Clínico geral'
            ELSE (ARRAY['Clínico geral','Dermatologia','Ortopedia','Cardiologia'])[(b.n % 4) + 1]
       END AS especialidade,
       CASE WHEN b.n = 80 THEN 3 WHEN b.n = 81 THEN 3 WHEN b.n = 82 THEN 2
            WHEN b.n = 83 THEN 3 WHEN b.n = 84 THEN 3 WHEN b.n = 85 THEN 4
            WHEN b.n = 86 THEN 2 ELSE 0 END AS reps_busca,
       (ARRAY['Ana','Bruno','Carla','Diego','Elisa','Felipe','Gabriela','Hugo','Irene','João',
              'Karen','Lucas','Mariana','Nicolas','Olívia','Pedro','Quésia','Rafael','Sofia','Tiago'])
           [((b.n - 1) % 20) + 1] || ' ' ||
       (ARRAY['Silva','Souza','Costa','Oliveira','Pereira','Lima','Gomes','Ribeiro','Almeida','Rocha'])
           [((b.n - 1) % 10) + 1] AS nome_paciente,
       (date '1950-01-01' + ((b.n * 1543) % 25567)) AS nascimento,
       CASE WHEN b.n % 2 = 0 THEN 'primeira_consulta' ELSE 'retorno' END AS tipo_visita,
       NULL::int AS id_conversa,
       NULL::int AS id_horario,
       NULL::int AS id_reserva
  FROM base_plano b;

-- Conversas, com o passo atual e o encerramento de cada categoria.
INSERT INTO conversa (id_passo_atual, contato, inicio, ultima_interacao, revisao,
                      encerrada_em, encerramento_motivo, encerramento_etapa)
SELECT ps.id_passo, p.contato, p.inicio, p.fim, 2,
       CASE WHEN p.encerramento_motivo IS NOT NULL THEN p.fim END,
       p.encerramento_motivo, p.encerramento_etapa
  FROM plano p
  JOIN passo_roteiro ps ON ps.codigo_passo = p.id_passo_atual_codigo
 ORDER BY p.n;

UPDATE plano p SET id_conversa = c.id_conversa
  FROM conversa c
 WHERE c.contato = p.contato;

-- Ações do paciente e do bot: o bot abre a conversa, o paciente encerra a última ação.
INSERT INTO interacao (id_conversa, autor, instante)
SELECT id_conversa, 'bot', inicio FROM plano
UNION ALL
SELECT id_conversa, 'paciente', fim FROM plano;

-- Tentativa de agendamento de cada conversa que iniciou a escolha de horário.
INSERT INTO tentativa (id_conversa, numero, id_especialidade, tipo_visita, resultado, iniciada_em, finalizada_em)
SELECT p.id_conversa, 1, e.id_especialidade, p.tipo_visita,
       CASE
           WHEN p.confirma THEN 'confirmed'
           WHEN p.categoria IN ('viu_horarios_saiu') THEN 'exited'
           WHEN p.categoria IN ('viu_sem_horarios_saiu') THEN 'no_slots'
           ELSE 'abandoned'
       END,
       p.inicio, p.fim
  FROM plano p
  JOIN especialidade e ON e.nome_especialidade = p.especialidade
  JOIN clinica c ON c.id_clinica = e.id_clinica AND c.nome = 'Clínica Demonstração'
 WHERE p.iniciou_agendar;

UPDATE conversa c SET id_tentativa_atual = t.id_tentativa
  FROM tentativa t
 WHERE t.id_conversa = c.id_conversa
   AND c.contato LIKE 'demo\_%';

-- Pacientes, horários escolhidos e reservas. Cada horário é ocupado por uma reserva ativa só,
-- então a escolha pula horários já reservados (o índice único parcial garante isso no banco).
DO $$
DECLARE
    r RECORD;
    v_horario INT;
    v_paciente INT;
    v_reserva INT;
BEGIN
    FOR r IN SELECT * FROM plano WHERE seleciona_horario ORDER BY n LOOP
        IF r.confirma THEN
            SELECT h.id_horario INTO v_horario
              FROM horario h
             WHERE h.inicio >= r.fim + interval '2 days'
               AND NOT EXISTS (SELECT 1 FROM reserva x
                                WHERE x.id_horario = h.id_horario AND x.cancelada_em IS NULL)
             ORDER BY h.inicio, h.id_horario
             LIMIT 1;
        ELSE
            SELECT h.id_horario INTO v_horario
              FROM horario h
             WHERE h.inicio >= r.inicio + interval '2 days'
             ORDER BY h.inicio, h.id_horario
             LIMIT 1;
        END IF;

        UPDATE plano SET id_horario = v_horario WHERE n = r.n;

        IF r.confirma THEN
            INSERT INTO paciente (nome, data_nascimento) VALUES (r.nome_paciente, r.nascimento)
            RETURNING id_paciente INTO v_paciente;

            UPDATE conversa SET id_paciente = v_paciente WHERE id_conversa = r.id_conversa;

            INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em, cancelada_em)
            VALUES (v_horario, v_paciente, r.id_conversa, r.fim,
                    CASE WHEN r.cancela THEN r.fim + interval '2 hours' END)
            RETURNING id_reserva INTO v_reserva;

            UPDATE plano SET id_reserva = v_reserva WHERE n = r.n;
        END IF;
    END LOOP;
END $$;

UPDATE tentativa t SET id_horario_selecionado = p.id_horario
  FROM plano p
 WHERE t.id_conversa = p.id_conversa
   AND p.seleciona_horario;

-- Eventos do funil, na ordem em que acontecem em cada conversa. Um INSERT por tipo, para que
-- cada coluna tenha um tipo fixo.
INSERT INTO evento_conversa (id_conversa, id_tentativa, tipo, instante)
SELECT p.id_conversa, t.id_tentativa, 'STARTED_SCHEDULING', p.inicio
  FROM plano p JOIN tentativa t ON t.id_conversa = p.id_conversa
 WHERE p.iniciou_agendar;

INSERT INTO evento_conversa (id_conversa, id_tentativa, tipo, instante, id_especialidade)
SELECT p.id_conversa, t.id_tentativa, 'ANSWERED_SPECIALTY', p.inicio, e.id_especialidade
  FROM plano p
  JOIN tentativa t ON t.id_conversa = p.id_conversa
  JOIN especialidade e ON e.nome_especialidade = p.especialidade
  JOIN clinica c ON c.id_clinica = e.id_clinica AND c.nome = 'Clínica Demonstração'
 WHERE p.iniciou_agendar;

-- Busca com horários disponíveis: uma por conversa.
INSERT INTO evento_conversa (id_conversa, id_tentativa, tipo, instante)
SELECT p.id_conversa, t.id_tentativa, 'SLOT_SEARCH_RESULT', p.inicio
  FROM plano p JOIN tentativa t ON t.id_conversa = p.id_conversa
 WHERE p.busca_com_horario;

-- Busca sem horários: um evento por ocorrência, no mesmo instante da linha de busca_sem_horario.
INSERT INTO evento_conversa (id_conversa, id_tentativa, tipo, instante)
SELECT p.id_conversa, t.id_tentativa, 'SLOT_SEARCH_RESULT', p.inicio + make_interval(mins => busca.k)
  FROM plano p
  JOIN tentativa t ON t.id_conversa = p.id_conversa
  CROSS JOIN LATERAL generate_series(1, p.reps_busca) AS busca(k)
 WHERE p.reps_busca > 0;

INSERT INTO evento_conversa (id_conversa, id_tentativa, tipo, instante, id_horario)
SELECT p.id_conversa, t.id_tentativa, 'SELECTED_SLOT', p.inicio, p.id_horario
  FROM plano p JOIN tentativa t ON t.id_conversa = p.id_conversa
 WHERE p.seleciona_horario;

INSERT INTO evento_conversa (id_conversa, id_tentativa, tipo, instante, id_horario, id_reserva)
SELECT p.id_conversa, t.id_tentativa, 'APPOINTMENT_CONFIRMED', p.fim, p.id_horario, p.id_reserva
  FROM plano p JOIN tentativa t ON t.id_conversa = p.id_conversa
 WHERE p.confirma;

-- Saída explícita: com tentativa quando a conversa começou a agendar, sem tentativa caso contrário.
INSERT INTO evento_conversa (id_conversa, id_tentativa, tipo, instante)
SELECT p.id_conversa, t.id_tentativa, 'EXITED', p.fim
  FROM plano p JOIN tentativa t ON t.id_conversa = p.id_conversa
 WHERE p.sai AND p.iniciou_agendar;

INSERT INTO evento_conversa (id_conversa, id_tentativa, tipo, instante)
SELECT p.id_conversa, NULL::int, 'EXITED', p.fim
  FROM plano p
 WHERE p.sai AND NOT p.iniciou_agendar;

-- Buscas sem horário: uma linha por ocorrência, com a repetição de cada conversa (RN-21).
INSERT INTO busca_sem_horario (id_conversa, id_tentativa, id_especialidade, instante)
SELECT p.id_conversa, t.id_tentativa, e.id_especialidade, p.inicio + make_interval(mins => busca.k)
  FROM plano p
  JOIN tentativa t ON t.id_conversa = p.id_conversa
  JOIN especialidade e ON e.nome_especialidade = p.especialidade
  JOIN clinica c ON c.id_clinica = e.id_clinica AND c.nome = 'Clínica Demonstração'
  CROSS JOIN LATERAL generate_series(1, p.reps_busca) AS busca(k)
 WHERE p.reps_busca > 0;

