-- Dados sintéticos e determinísticos para medir o desempenho das consultas de Analytics.
BEGIN;
INSERT INTO clinica (nome, endereco, telefone) VALUES ('Clínica Bench', 'Rua Teste, 1', '0000000000');
INSERT INTO expediente (id_clinica, dia_semana, abertura, fechamento)
SELECT 1, d, CASE WHEN d = 0 THEN NULL WHEN d = 6 THEN '09:00' ELSE '07:00' END::time,
             CASE WHEN d = 0 THEN NULL WHEN d = 6 THEN '13:00' ELSE '18:00' END::time
  FROM generate_series(0, 6) AS d;
INSERT INTO especialidade (id_clinica, nome_especialidade) VALUES (1, 'Clínico geral'), (1, 'Dermatologia'), (1, 'Ortopedia'), (1, 'Cardiologia');
INSERT INTO medico (id_especialidade, nome_medico) SELECT (n % 4) + 1, 'Médico ' || n FROM generate_series(1, 6) n;
INSERT INTO sala (id_clinica, nome) SELECT 1, 'Sala ' || n FROM generate_series(1, 6) n;
INSERT INTO horario (id_medico, id_sala, inicio, fim)
SELECT s.id_sala, s.id_sala,
       (d.day + interval '8 hours' + k * interval '30 minutes') AT TIME ZONE 'America/Sao_Paulo',
       (d.day + interval '8 hours' + (k + 1) * interval '30 minutes') AT TIME ZONE 'America/Sao_Paulo'
  FROM generate_series(timestamp '2025-11-01', timestamp '2026-10-31', interval '1 day') AS d(day)
 CROSS JOIN generate_series(0, 19) AS k
 CROSS JOIN sala s
 WHERE extract(dow FROM d.day) BETWEEN 1 AND 6;
INSERT INTO conversa (id_passo_atual, contato, inicio, ultima_interacao, encerrada_em, encerramento_motivo, encerramento_etapa)
SELECT CASE WHEN n % 5 = 0 THEN (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'closed')
            ELSE (SELECT id_passo FROM passo_roteiro WHERE codigo_passo = 'menu') END,
       'bench_' || n,
       t0 + n * interval '170 seconds',
       t0 + n * interval '170 seconds' + interval '5 minutes',
       CASE WHEN n % 5 = 0 THEN t0 + n * interval '170 seconds' + interval '3 minutes' END,
       CASE WHEN n % 5 = 0 THEN 'exited' END,
       CASE WHEN n % 5 = 0 THEN 'slot_selection' END
  FROM generate_series(1, 150000) AS n
 CROSS JOIN (SELECT timestamptz '2025-11-01 00:00:00-03' AS t0) base;
INSERT INTO evento_conversa (id_conversa, tipo, instante)
SELECT c.id_conversa, e.tipo, c.inicio + e.delay
  FROM conversa c
 CROSS JOIN LATERAL (VALUES
   ('STARTED_SCHEDULING', interval '30 seconds', c.id_conversa % 3 <> 0),
   ('ANSWERED_SPECIALTY', interval '60 seconds', c.id_conversa % 3 <> 0),
   ('SLOT_SEARCH_RESULT', interval '120 seconds', c.id_conversa % 3 <> 0),
   ('SELECTED_SLOT', interval '180 seconds', c.id_conversa % 3 <> 0 AND c.id_conversa % 4 = 0),
   ('APPOINTMENT_CONFIRMED', interval '240 seconds', c.id_conversa % 3 <> 0 AND c.id_conversa % 4 = 0)
 ) AS e(tipo, delay, ativo)
 WHERE e.ativo;
INSERT INTO paciente (nome, data_nascimento) SELECT 'Paciente ' || n, date '1990-01-01' + n FROM generate_series(1, 25000) n;
INSERT INTO reserva (id_horario, id_paciente, id_conversa_origem, confirmada_em, cancelada_em)
SELECT k, k, id_conversa, inicio + interval '240 seconds',
       CASE WHEN k % 10 = 0 THEN inicio + interval '1 day' END
  FROM (SELECT c.id_conversa, c.inicio, row_number() OVER (ORDER BY c.id_conversa) AS k
          FROM conversa c WHERE c.id_conversa % 3 <> 0 AND c.id_conversa % 4 = 0) confirmadas;
INSERT INTO tentativa (id_conversa, numero, id_especialidade, iniciada_em)
SELECT c.id_conversa, 1, (c.id_conversa % 4) + 1, c.inicio + interval '100 seconds'
  FROM conversa c WHERE c.id_conversa % 5 = 1 AND c.id_conversa % 3 <> 0;
INSERT INTO busca_sem_horario (id_conversa, id_tentativa, id_especialidade, instante)
SELECT t.id_conversa, t.id_tentativa, t.id_especialidade, t.iniciada_em + interval '20 seconds'
  FROM tentativa t;
COMMIT;
ANALYZE;
SELECT 'conversa' tabela, count(*) FROM conversa UNION ALL SELECT 'evento', count(*) FROM evento_conversa
UNION ALL SELECT 'horario', count(*) FROM horario UNION ALL SELECT 'reserva', count(*) FROM reserva
UNION ALL SELECT 'busca', count(*) FROM busca_sem_horario;
