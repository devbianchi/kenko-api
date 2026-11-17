CREATE TABLE interacao (
    id_interacao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_conversa  INT NOT NULL REFERENCES conversa (id_conversa),
    autor        VARCHAR(10) NOT NULL CHECK (autor IN ('bot', 'paciente')),
    instante     TIMESTAMPTZ NOT NULL
);
