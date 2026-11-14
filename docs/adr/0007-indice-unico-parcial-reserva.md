# ADR-0007: Proteção contra dupla reserva com índice único parcial

**Status:** Aceita
**Data:** 2026-11-14

## Contexto

O escopo exige que duas conversas não reservem o mesmo horário (RN-17, VAL-07). Uma verificação do tipo "consulta se o horário está livre e depois insere" não é segura: duas transações podem passar pela verificação ao mesmo tempo e inserir ambas.

Horários cancelados precisam continuar no histórico, então não basta uma restrição simples sobre `id_horario`.

## Decisão

Criar a tabela `reserva` com um índice único parcial:

```sql
CREATE UNIQUE INDEX uq_reserva_horario_ativa
    ON reserva (id_horario)
    WHERE cancelada_em IS NULL;
```

Consequências do desenho:

- No máximo uma reserva não cancelada por horário, garantida pelo banco.
- Reservas canceladas permanecem como histórico.
- A inserção ocorre dentro da transação de confirmação (ADR-0006).
- Violação dessa constraint é traduzida para 409 `SLOT_UNAVAILABLE`, com novas opções retornadas na resposta.
- A seleção de horário também revalida disponibilidade, mas essa checagem é apenas informativa para o paciente. A garantia real é a constraint.

## Consequências

- A integridade não depende da aplicação estar correta nem de um único nó.
- A regra fica acoplada ao PostgreSQL (índice parcial), o que é coerente com a ADR-0001.
- Os testes de concorrência (duas conversas, mesmo horário) verificam essa garantia diretamente, na ADR-0003.

## Alternativas consideradas

- **Verificar na aplicação e depois inserir:** tem condição de corrida. Descartado.
- **Lock do horário antes da verificação (`SELECT ... FOR UPDATE` na linha de `horario`):** funciona, mas exige disciplina em todos os pontos de escrita. Pode ser usado como complemento, sem substituir a constraint.
- **Isolamento `SERIALIZABLE`:** correto, mas com custo maior e tratamento de falhas de serialização espalhado pelo código. Descartado.
- **Coluna de status com constraint única em `(id_horario, status_ativo)`:** exige coluna derivada extra. O índice parcial expressa a mesma regra sem ela.