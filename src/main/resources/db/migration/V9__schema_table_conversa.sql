CREATE TABLE conversa (
    id_conversa         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_passo_atual      INT NOT NULL REFERENCES passo_roteiro (id_passo),
    contato             VARCHAR(20) NOT NULL UNIQUE,
    inicio              TIMESTAMPTZ NOT NULL,
    revisao             INT NOT NULL DEFAULT 0,
    encerrada_em        TIMESTAMPTZ,
    encerramento_motivo VARCHAR(30),
    encerramento_etapa  VARCHAR(30)
);