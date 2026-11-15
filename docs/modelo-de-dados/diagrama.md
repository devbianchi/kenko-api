# Diagrama entidade-relacionamento

```mermaid
erDiagram
    clinica ||--o{ expediente : "tem"
    clinica ||--o{ especialidade : "oferece"
    clinica ||--o{ sala : "possui"
    especialidade ||--o{ medico : "classifica"
    medico ||--o{ horario : "atende"
    sala ||--o{ horario : "abriga"
    horario ||--o{ reserva : "pode ter"
    paciente ||--o{ reserva : "titular de"
    conversa ||--o| paciente : "identifica"
    conversa ||--o{ tentativa : "realiza"
    conversa ||--o{ interacao : "registra"
    conversa ||--o{ evento_conversa : "gera"
    conversa ||--o{ acao_processada : "processa"
    conversa ||--o{ reserva : "origina"
    passo_roteiro ||--o{ opcao_roteiro : "oferece"
    passo_roteiro ||--o{ conversa : "está em"
    especialidade ||--o{ opcao_roteiro : "referenciada por"
    tentativa ||--o{ evento_conversa : "agrupa"
    especialidade ||--o{ tentativa : "escolhida em"
    horario ||--o{ tentativa : "selecionado em"
    tentativa ||--o{ busca_sem_horario : "registra"
    especialidade ||--o{ busca_sem_horario : "pesquisada em"
    conversa ||--o{ busca_sem_horario : "origina"
```

Notas de leitura:

- `conversa` tem no máximo um `paciente` (coluna `id_paciente`, nullable). Paciente pertence a exatamente um contato, por isso `paciente` guarda `id_conversa` único.
- `reserva` referencia `horario` e `paciente`. A unicidade de reserva ativa por horário está no índice parcial, descrito no dicionário.