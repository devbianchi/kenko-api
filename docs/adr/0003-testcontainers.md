# ADR-0003: Testes de integração com Testcontainers

**Status:** Aceita
**Data:** 2026-11-14

## Contexto

Os critérios mais importantes do sistema dependem do banco: índice único parcial, transações, revisão condicional, idempotência por unicidade e as queries de métricas. Testes com H2 não verificam essas garantias. Um banco local compartilhado produz estado conflitante entre execuções.

## Decisão

Usar **Testcontainers com PostgreSQL** nos testes que dependem do banco. A mesma sequência de migrations Flyway é aplicada ao container em cada execução.

Separação dos testes:

- **Unitários (sem banco):** regras puras, como classificação de status, cálculo de mediana e P90, regra de semana domingo–sábado e validação de entrada. Usam `Clock` fixo.
- **Integração (com PostgreSQL):** repositórios, queries de métricas, transações, reserva concorrente, idempotência e migrations do zero.
- **HTTP (com Spring MockMvc ou similar):** contrato de status, envelope de erro e formato de resposta.

## Consequências

- Exige Docker na máquina de desenvolvimento e no CI.
- Os testes de integração são mais lentos que os unitários. Para reduzir o custo, o container é reutilizado entre os testes da mesma execução.
- Os critérios VAL-xx que dependem de banco podem ser verificados de forma reproduzível.

## Alternativas consideradas

- **H2 em modo PostgreSQL:** mais rápido, mas não reproduz constraints nem índices parciais. Descartado.
- **Banco local compartilhado:** depende da máquina de cada integrante e produz falhas intermitentes. Descartado.
- **Somente testes unitários com repositórios simulados:** não prova as garantias de concorrência. Descartado.