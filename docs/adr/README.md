# Decisões de arquitetura — Kenko API

Registros curtos das decisões técnicas do backend. Cada ADR descreve o contexto, a decisão tomada, as consequências e as alternativas descartadas.

Uma decisão aceita não é editada para refletir uma mudança posterior. Para revertê-la, cria-se um novo ADR que substitui o anterior, e o antigo recebe o status "Substituída por ADR-XXXX".

| ADR | Título | Status | Data |
|---|---|---|---|
| [0001](0001-postgresql.md) | PostgreSQL como banco de dados | Aceita | 2026-11-14 |
| [0002](0002-spring-jdbc-jdbcclient.md) | Acesso a dados com Spring JDBC (`JdbcClient`) | Substituída por ADR-0010 | 2026-11-14 |
| [0003](0003-testcontainers.md) | Testes de integração com Testcontainers | Parcialmente substituída por ADR-0010 | 2026-11-14 |
| [0004](0004-pacotes-por-feature.md) | Organização do código por feature | Substituída por ADR-0010 | 2026-11-14 |
| [0005](0005-clock-por-requisicao.md) | Instante de avaliação único por requisição | Parcialmente substituída por ADR-0010 | 2026-11-14 |
| [0006](0006-idempotencia-e-revisao.md) | Idempotência por `actionId` e controle de revisão | Aceita | 2026-11-14 |
| [0007](0007-indice-unico-parcial-reserva.md) | Proteção contra dupla reserva com índice único parcial | Aceita | 2026-11-14 |
| [0008](0008-cors-e-origem-do-frontend.md) | Origem do frontend liberada por CORS com configuração externa | Aceita | 2026-11-16 |
| [0009](0009-carga-de-demonstracao-por-perfil.md) | Carga de demonstração controlada pelo perfil `demo` | Parcialmente substituída por ADR-0011 | 2026-11-16 |
| [0010](0010-backend-typescript.md) | Backend em TypeScript com Node e Express | Aceita | 2026-11-17 |
| [0011](0011-carga-de-demonstracao-por-script.md) | Carga de demonstração por script de seed | Aceita | 2026-11-17 |
