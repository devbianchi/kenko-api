-- Horários oferecidos em cada tentativa, na ordem mostrada. A escolha (fase 5d) valida o slotId
-- contra esta lista, então ela precisa sobreviver à requisição (escopo, RF-02 e RN-16).
CREATE TABLE oferta_horario (
    id_tentativa INT NOT NULL REFERENCES tentativa (id_tentativa),
    id_horario   INT NOT NULL REFERENCES horario (id_horario),
    ordem        SMALLINT NOT NULL,
    PRIMARY KEY (id_tentativa, id_horario),
    UNIQUE (id_tentativa, ordem)
);
