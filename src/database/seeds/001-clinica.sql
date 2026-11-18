-- Clínica, expediente e especialidades da demonstração.
-- Domingo fechado; segunda a sexta 07h–18h; sábado 09h–13h.

INSERT INTO clinica (nome, endereco, telefone)
VALUES ('Clínica Demonstração', 'Rua de Exemplo, 100', '1100000000');

INSERT INTO expediente (id_clinica, dia_semana, abertura, fechamento)
SELECT c.id_clinica, d.dia, d.abre, d.fecha
  FROM clinica c
 CROSS JOIN (VALUES
        (0, NULL::time,          NULL::time),
        (1, '07:00'::time,       '18:00'::time),
        (2, '07:00'::time,       '18:00'::time),
        (3, '07:00'::time,       '18:00'::time),
        (4, '07:00'::time,       '18:00'::time),
        (5, '07:00'::time,       '18:00'::time),
        (6, '09:00'::time,       '13:00'::time)
     ) AS d(dia, abre, fecha)
 WHERE c.nome = 'Clínica Demonstração';

INSERT INTO especialidade (id_clinica, nome_especialidade)
SELECT c.id_clinica, e.nome
  FROM clinica c
 CROSS JOIN (VALUES ('Clínico geral'), ('Dermatologia'), ('Ortopedia'), ('Cardiologia')) AS e(nome)
 WHERE c.nome = 'Clínica Demonstração'
 ORDER BY e.nome;
