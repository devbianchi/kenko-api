\set ini '2026-06-01T00:00:00-03:00'
\set fim '2026-07-01T00:00:00-03:00'
\set agora '2026-11-10T15:15:00Z'
\echo '== Q1 coorte (facts)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
WITH coorte AS (
  SELECT c.id_conversa,
         EXISTS (SELECT 1 FROM evento_conversa e WHERE e.id_conversa = c.id_conversa AND e.tipo = 'STARTED_SCHEDULING' AND e.instante <= :'agora') AS agendou,
         EXISTS (SELECT 1 FROM evento_conversa e WHERE e.id_conversa = c.id_conversa AND e.tipo = 'APPOINTMENT_CONFIRMED' AND e.instante <= :'agora') AS confirmou,
         NOT EXISTS (SELECT 1 FROM expediente x WHERE x.dia_semana = extract(dow FROM (c.inicio AT TIME ZONE 'America/Sao_Paulo'))::int AND x.abertura IS NOT NULL AND x.fechamento IS NOT NULL AND (c.inicio AT TIME ZONE 'America/Sao_Paulo')::time >= x.abertura AND (c.inicio AT TIME ZONE 'America/Sao_Paulo')::time < x.fechamento) AS fora
    FROM conversa c WHERE c.inicio >= :'ini'::timestamptz AND c.inicio < :'fim'::timestamptz AND c.inicio <= :'agora'::timestamptz)
SELECT count(*), count(*) FILTER (WHERE agendou), count(*) FILTER (WHERE agendou AND confirmou), count(*) FILTER (WHERE fora) FROM coorte;
\echo '== Q2 duracoes'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT extract(epoch FROM (min(e.instante) - c.inicio))::float8 FROM conversa c
  JOIN evento_conversa e ON e.id_conversa = c.id_conversa AND e.tipo = 'APPOINTMENT_CONFIRMED' AND e.instante <= :'agora'
 WHERE c.inicio >= :'ini'::timestamptz AND c.inicio < :'fim'::timestamptz AND c.inicio <= :'agora'
   AND EXISTS (SELECT 1 FROM evento_conversa s WHERE s.id_conversa = c.id_conversa AND s.tipo = 'STARTED_SCHEDULING' AND s.instante <= :'agora')
 GROUP BY c.id_conversa, c.inicio;
\echo '== Q3 agenda'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT count(*), count(*) FILTER (WHERE EXISTS (SELECT 1 FROM reserva r WHERE r.id_horario = h.id_horario AND r.cancelada_em IS NULL))
  FROM horario h WHERE h.inicio >= :'ini'::timestamptz AND h.inicio < :'fim'::timestamptz;
\echo '== Q4 buscas sem horario'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT e.nome_especialidade, count(*) FROM busca_sem_horario b JOIN especialidade e ON e.id_especialidade = b.id_especialidade
 WHERE b.instante >= :'ini'::timestamptz AND b.instante < :'fim'::timestamptz AND b.instante <= :'agora' GROUP BY 1;
\echo '== Q5 heatmap'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT extract(dow FROM (c.inicio AT TIME ZONE 'America/Sao_Paulo'))::int, floor(extract(hour FROM (c.inicio AT TIME ZONE 'America/Sao_Paulo'))/2)::int, count(*)
  FROM conversa c WHERE c.inicio >= :'ini'::timestamptz AND c.inicio < :'fim'::timestamptz AND c.inicio <= :'agora' GROUP BY 1,2;
\echo '== Q6 funil (LEFT JOIN eventos)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT count(*) FROM (SELECT c.id_conversa, bool_or(e.tipo = 'STARTED_SCHEDULING') AS iniciou
   FROM conversa c LEFT JOIN evento_conversa e ON e.id_conversa = c.id_conversa AND e.instante <= :'agora'
  WHERE c.inicio >= :'ini'::timestamptz AND c.inicio < :'fim'::timestamptz AND c.inicio <= :'agora' GROUP BY c.id_conversa) m;
\echo '== Q7 painel: totais do mes (dashboard/calendario usam ::date)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT count(*) FROM reserva r JOIN horario h ON h.id_horario = r.id_horario
 WHERE (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= '2026-06-01'::date AND (h.inicio AT TIME ZONE 'America/Sao_Paulo')::date < '2026-07-01'::date;
\echo '== Q8 painel: mesmo filtro por instante'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT count(*) FROM reserva r JOIN horario h ON h.id_horario = r.id_horario
 WHERE h.inicio >= :'ini'::timestamptz AND h.inicio < :'fim'::timestamptz;
