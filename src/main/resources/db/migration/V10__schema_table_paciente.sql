CREATE TABLE paciente (
    id_paciente     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_conversa     INT NOT NULL UNIQUE REFERENCES conversa (id_conversa),
    nome            VARCHAR(100) NOT NULL,
    data_nascimento DATE NOT NULL
);