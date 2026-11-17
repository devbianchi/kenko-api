CREATE TABLE paciente (
    id_paciente     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome            VARCHAR(100) NOT NULL,
    data_nascimento DATE NOT NULL
);
