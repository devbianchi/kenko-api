CREATE TABLE tentativa (
    id_tentativa           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_conversa            INT NOT NULL REFERENCES conversa (id_conversa),
    numero                 SMALLINT NOT NULL,
    id_especialidade       INT REFERENCES especialidade (id_especialidade),
    tipo_visita            VARCHAR(20) CHECK (tipo_visita IN ('primeira_consulta', 'retorno')),
    id_horario_selecionado INT REFERENCES horario (id_horario),
    resultado              VARCHAR(20) CHECK (resultado IN ('available', 'no_slots', 'confirmed', 'exited', 'abandoned')),
    iniciada_em            TIMESTAMPTZ NOT NULL,
    finalizada_em          TIMESTAMPTZ,
    UNIQUE (id_conversa, numero)
);
