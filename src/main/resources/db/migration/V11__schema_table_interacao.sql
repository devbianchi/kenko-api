CREATE TABLE interacao (
    id_interacao INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_conversa  INT NOT NULL REFERENCES conversa (id_conversa),
    id_passo     INT REFERENCES passo_roteiro (id_passo),
    id_opcao     INT REFERENCES opcao_roteiro (id_opcao),
    autor        VARCHAR(10) NOT NULL CHECK (autor IN ('BOT','PACIENTE')),
    action_id    VARCHAR(64),
    instante     TIMESTAMPTZ NOT NULL,
    UNIQUE (id_conversa, action_id)
);