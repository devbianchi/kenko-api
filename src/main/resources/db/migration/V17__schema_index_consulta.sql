CREATE INDEX ix_horario_medico_inicio      ON horario (id_medico, inicio);
CREATE INDEX ix_horario_sala_inicio        ON horario (id_sala, inicio);
CREATE INDEX ix_conversa_inicio            ON conversa (inicio);
CREATE INDEX ix_interacao_conversa_instante ON interacao (id_conversa, instante);
CREATE INDEX ix_evento_conversa_tipo       ON evento_conversa (id_conversa, tipo);
CREATE INDEX ix_evento_tipo_instante       ON evento_conversa (tipo, instante);
CREATE INDEX ix_reserva_conversa_origem    ON reserva (id_conversa_origem);
