CREATE TABLE opcao_roteiro (
    id_opcao         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_passo         INT NOT NULL REFERENCES passo_roteiro (id_passo),
    id_passo_destino INT REFERENCES passo_roteiro (id_passo),
    rotulo           VARCHAR(100) NOT NULL,
    acao             VARCHAR(30)
);
