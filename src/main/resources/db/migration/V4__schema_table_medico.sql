CREATE TABLE medico (
    id_medico        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_especialidade INT NOT NULL REFERENCES especialidade (id_especialidade),
    nome_medico      VARCHAR(100) NOT NULL
);