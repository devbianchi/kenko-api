CREATE TABLE passo_roteiro (
    id_passo INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    texto    TEXT NOT NULL,
    etapa    VARCHAR(30) NOT NULL
             CHECK (etapa IN ('menu','triage','slot_selection','patient_data','confirmation'))
);