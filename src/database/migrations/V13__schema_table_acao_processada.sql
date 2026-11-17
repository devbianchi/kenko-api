CREATE TABLE acao_processada (
    id_acao_processada BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_conversa        INT NOT NULL REFERENCES conversa (id_conversa),
    action_id          VARCHAR(64) NOT NULL,
    hash_entrada       CHAR(64) NOT NULL,
    resultado          JSONB NOT NULL,
    criada_em          TIMESTAMPTZ NOT NULL,
    UNIQUE (id_conversa, action_id)
);
