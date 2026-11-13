CREATE TABLE expediente (
    id_expediente INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_clinica    INT NOT NULL REFERENCES clinica (id_clinica),
    dia_semana    SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    abertura      TIME,
    fechamento    TIME,
    UNIQUE (id_clinica, dia_semana)
);