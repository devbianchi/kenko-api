CREATE TABLE agendamento (
    id_agendamento INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_paciente    INT NOT NULL REFERENCES paciente (id_paciente),
    id_horario     INT NOT NULL REFERENCES horario (id_horario),
    id_conversa    INT NOT NULL REFERENCES conversa (id_conversa), 
    confirmado_em  TIMESTAMPTZ NOT NULL,
    cancelado_em   TIMESTAMPTZ
);
