CREATE UNIQUE INDEX uq_agendamento_horario_ativo
    ON agendamento (id_horario) WHERE cancelado_em IS NULL;