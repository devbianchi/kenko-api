CREATE TABLE sala (
    id_sala    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_clinica INT NOT NULL REFERENCES clinica (id_clinica),
    nome       VARCHAR(40) NOT NULL,
    UNIQUE (id_clinica, nome)
);