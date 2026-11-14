# ADR-0001: PostgreSQL como banco de dados

**Status:** Aceita
**Data:** 2026-11-14

## Contexto

O schema já definido nas migrations V1 a V9 usa recursos específicos: `TIMESTAMPTZ`, `GENERATED ALWAYS AS IDENTITY`, `CHECK` e `UNIQUE` compostos. As métricas de analytics dependem de window functions (`ROW_NUMBER`, `AVG ... OVER`) e de agregações sobre `EXISTS`. A proteção contra dupla reserva depende de índice único parcial (`WHERE cancelada_em IS NULL`).

## Decisão

Usar **PostgreSQL** como único SGBD, em desenvolvimento, testes e demonstração.

## Consequências

- O SQL pode usar recursos nativos sem camada de tradução.
- Os testes exigem um PostgreSQL real, o que leva à ADR-0003.
- O ambiente local precisa de Docker para os testes de integração.
- Trocar de SGBD no futuro exigiria reescrever as queries e os índices parciais.

## Alternativas consideradas

- **H2 (modo PostgreSQL):** rápido para testes, mas não reproduz com fidelidade índices parciais, comportamento de `TIMESTAMPTZ` e diagnósticos de constraint. Descartado para testes.
- **MySQL/MariaDB:** não oferece índice parcial equivalente, e o suporte a `TIMESTAMPTZ` e window functions é diferente.
- **SQL Server:** índice filtrado existe, mas o ecossistema e o SQL divergem do schema já escrito.