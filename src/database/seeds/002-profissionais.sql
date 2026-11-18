-- Médicos e salas da demonstração. Cada médico tem uma única especialidade (RN-14),
-- e cada sala é usada por um único médico, para não haver conflito de sala.

INSERT INTO medico (id_especialidade, nome_medico)
SELECT e.id_especialidade, m.nome
  FROM (VALUES
        ('Dra. Helena',  'Dermatologia'),
        ('Dr. Paulo',    'Dermatologia'),
        ('Dr. Marcos',   'Clínico geral'),
        ('Dra. Beatriz', 'Clínico geral'),
        ('Dr. Rafael',   'Ortopedia'),
        ('Dra. Carla',   'Cardiologia')
     ) AS m(nome, especialidade)
  JOIN especialidade e ON e.nome_especialidade = m.especialidade
  JOIN clinica c ON c.id_clinica = e.id_clinica
 WHERE c.nome = 'Clínica Demonstração'
 ORDER BY m.nome;

INSERT INTO sala (id_clinica, nome)
SELECT c.id_clinica, 'Sala ' || n
  FROM clinica c
 CROSS JOIN generate_series(1, 6) AS n
 WHERE c.nome = 'Clínica Demonstração'
 ORDER BY n;
