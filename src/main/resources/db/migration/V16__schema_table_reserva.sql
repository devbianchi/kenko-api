CREATE TABLE reserva (
    id_reserva         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_horario         INT NOT NULL REFERENCES horario (id_horario),
    id_paciente        INT NOT NULL REFERENCES paciente (id_paciente),
    id_conversa_origem INT NOT NULL REFERENCES conversa (id_conversa),
    confirmada_em      TIMESTAMPTZ NOT NULL,
    cancelada_em       TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_reserva_horario_ativa
    ON reserva (id_horario)
    WHERE cancelada_em IS NULL;
