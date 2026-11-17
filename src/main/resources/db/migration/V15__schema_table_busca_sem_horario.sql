CREATE TABLE busca_sem_horario (
    id_busca         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_conversa      INT NOT NULL REFERENCES conversa (id_conversa),
    id_tentativa     INT NOT NULL REFERENCES tentativa (id_tentativa),
    id_especialidade INT NOT NULL REFERENCES especialidade (id_especialidade),
    instante         TIMESTAMPTZ NOT NULL
);
