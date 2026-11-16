CREATE TABLE evento (
    id_evento        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_conversa      INT NOT NULL REFERENCES conversa (id_conversa),
    id_especialidade INT REFERENCES especialidade (id_especialidade),
    id_horario       INT REFERENCES horario (id_horario),
    tipo             VARCHAR(30) NOT NULL
                     CHECK (tipo IN ('STARTED_SCHEDULING','ANSWERED_SPECIALTY',
                                     'SLOT_SEARCH_RESULT','SELECTED_SLOT',
                                     'APPOINTMENT_CONFIRMED')),
    etapa            VARCHAR(30),
    resultado        VARCHAR(30),
    tentativa        INT NOT NULL DEFAULT 1,
    instante         TIMESTAMPTZ NOT NULL
);