CREATE TABLE passo_roteiro (
    id_passo     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_passo VARCHAR(40) NOT NULL UNIQUE,
    etapa        VARCHAR(30) NOT NULL
                 CHECK (etapa IN ('menu', 'triage', 'slot_selection', 'patient_data',
                                  'confirmation', 'appointments', 'clinic_information', 'closed')),
    texto        TEXT NOT NULL
);
