ALTER TABLE conversa
    ADD CONSTRAINT fk_conversa_paciente
    FOREIGN KEY (id_paciente) REFERENCES paciente (id_paciente);

ALTER TABLE conversa
    ADD CONSTRAINT fk_conversa_tentativa_atual
    FOREIGN KEY (id_tentativa_atual) REFERENCES tentativa (id_tentativa);

ALTER TABLE evento_conversa
    ADD CONSTRAINT fk_evento_reserva
    FOREIGN KEY (id_reserva) REFERENCES reserva (id_reserva);
