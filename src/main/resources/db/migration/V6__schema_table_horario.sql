CREATE TABLE horario (
    id_horario INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_medico  INT NOT NULL REFERENCES medico (id_medico),
    id_sala    INT NOT NULL REFERENCES sala (id_sala),
    inicio     TIMESTAMPTZ NOT NULL,
    fim        TIMESTAMPTZ NOT NULL,
    CHECK (fim > inicio)
);