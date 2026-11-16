# Decisões de arquitetura — Kenko API

Registros curtos das decisões técnicas do backend. Cada ADR descreve o contexto, a decisão tomada, as consequências e as alternativas descartadas.

Uma decisão aceita não é editada para refletir uma mudança posterior. Para revertê-la, cria-se um novo ADR que substitui o anterior, e o antigo recebe o status "Substituída por ADR-XXXX".

| ADR | Título | Status | Data |
|---|---|---|---|
| [0001](0001-postgresql.md) | PostgreSQL como banco de dados | Aceita | 2026-11-14 |
| [0002](0002-spring-jdbc-jdbcclient.md) | Acesso a dados com Spring JDBC (`JdbcClient`) | Aceita | 2026-11-14 |
| [0003](0003-testcontainers.md) | Testes de integração com Testcontainers | Aceita | 2026-11-14 |
| [0004](0004-pacotes-por-feature.md) | Organização do código por feature | Aceita | 2026-11-14 |
| [0005](0005-clock-por-requisicao.md) | Instante de avaliação único por requisição | Aceita | 2026-11-14 |
| [0006](0006-idempotencia-e-revisao.md) | Idempotência por `actionId` e controle de revisão | Aceita | 2026-11-14 |
| [0007](0007-indice-unico-parcial-reserva.md) | Proteção contra dupla reserva com índice único parcial | Aceita | 2026-11-14 |
| [0008](0008-cors-e-origem-do-frontend.md) | Origem do frontend liberada por CORS com configuração externa | Aceita | 2026-11-16 |