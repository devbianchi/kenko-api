# ADR-0002: Acesso a dados com Spring JDBC (`JdbcClient`)

**Status:** Substituída por ADR-0010
**Data:** 2026-11-14

## Contexto

Boa parte do valor do backend está em consultas de agregação: mediana, P90, histograma, funil com `MAX(CASE ...)`, ocupação com `EXISTS` sem multiplicação de linhas e média móvel. Essas consultas são descritas com SQL explícito nos documentos de backend. O schema é definido por migrations Flyway, não gerado a partir de entidades.

## Decisão

Usar **Spring JDBC com `JdbcClient`**, com as seguintes regras:

- SQL escrito à mão, mantido perto do repositório de cada feature.
- DTOs de leitura e de entrada como `record`.
- Transações com `@Transactional` na camada de serviço.
- Não usar entidades gerenciadas, lazy loading nem cache de sessão.

## Consequências

- O SQL fica visível e revisável, alinhado aos documentos.
- Há mais código de mapeamento, mas ele é explícito e previsível.
- Não há atualização automática de entidades: cada operação de escrita tem seu SQL.
- Controle de revisão e índices parciais funcionam como estão escritos, sem o ORM interpretar o estado.

## Alternativas consideradas

- **JPA/Hibernate:** o mapeamento de entidades não encaixa bem em agregações complexas. O flush automático e o cache de primeiro nível podem mascarar a ordem real das escritas, o que atrapalha a idempotência e a revisão. Descartado.
- **jOOQ:** SQL tipado e bom para agregações, mas adiciona uma geração de código e uma dependência extra sem ganho claro para este escopo. Descartado por ora.