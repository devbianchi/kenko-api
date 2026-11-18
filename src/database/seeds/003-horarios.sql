-- Horários de 30 minutos dentro do expediente, na janela de demonstração:
-- de 60 dias antes até 14 dias depois da data de referência (estratégia-de-datas.md).
-- Cada médico recebe a sala de mesma posição (médico 1 com sala 1, e assim por diante).

WITH ref AS (
    SELECT (current_setting('kenko.referencia')::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
),
dias AS (
    SELECT d::date AS dia, extract(dow FROM d)::int AS dow
      FROM ref,
           generate_series(ref.hoje - 60, ref.hoje + 14, interval '1 day') AS d
),
slots AS (
    SELECT g.t AT TIME ZONE 'America/Sao_Paulo' AS inicio
      FROM dias
      JOIN expediente e ON e.dia_semana = dias.dow AND e.abertura IS NOT NULL
      JOIN clinica c ON c.id_clinica = e.id_clinica AND c.nome = 'Clínica Demonstração'
     CROSS JOIN LATERAL generate_series(
         dias.dia::timestamp + e.abertura,
         dias.dia::timestamp + e.fechamento - interval '30 minutes',
         interval '30 minutes') AS g(t)
),
medicos AS (
    SELECT id_medico, row_number() OVER (ORDER BY id_medico) AS rn FROM medico
),
salas AS (
    SELECT id_sala, row_number() OVER (ORDER BY id_sala) AS rn FROM sala
)
INSERT INTO horario (id_medico, id_sala, inicio, fim)
SELECT m.id_medico, s.id_sala, sl.inicio, sl.inicio + interval '30 minutes'
  FROM slots sl
 CROSS JOIN medicos m
  JOIN salas s ON s.rn = m.rn
 ORDER BY sl.inicio, m.id_medico;
