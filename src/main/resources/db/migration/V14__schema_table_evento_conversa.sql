CREATE TABLE evento_conversa (
    id_evento        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_conversa      INT NOT NULL REFERENCES conversa (id_conversa),
    id_tentativa     INT REFERENCES tentativa (id_tentativa),
    tipo             VARCHAR(40) NOT NULL CHECK (tipo IN (
                         'STARTED_SCHEDULING', 'ANSWERED_SPECIALTY', 'SLOT_SEARCH_RESULT',
                         'SELECTED_SLOT', 'APPOINTMENT_CONFIRMED', 'EXITED')),
    instante         TIMESTAMPTZ NOT NULL,
    id_especialidade INT REFERENCES especialidade (id_especialidade),
    id_horario       INT REFERENCES horario (id_horario),
    id_reserva       INT
);
