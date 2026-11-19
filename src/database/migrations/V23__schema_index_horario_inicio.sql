-- Filtros de Dia, calendário e Home por intervalo de instante usam este índice.
-- Os índices existentes têm id_medico ou id_sala na frente, então não servem a uma faixa só por início.
CREATE INDEX ix_horario_inicio ON horario (inicio);
