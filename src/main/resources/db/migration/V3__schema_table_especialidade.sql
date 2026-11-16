CREATE TABLE especialidade (
    id_especialidade   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_clinica         INT NOT NULL REFERENCES clinica (id_clinica),
    nome_especialidade VARCHAR(60) NOT NULL,
    UNIQUE (id_clinica, nome_especialidade)
);
