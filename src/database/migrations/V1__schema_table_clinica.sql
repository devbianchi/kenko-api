CREATE TABLE clinica (
    id_clinica   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome         VARCHAR(100) NOT NULL,
    endereco     VARCHAR(200) NOT NULL,
    telefone     VARCHAR(20)  NOT NULL
);