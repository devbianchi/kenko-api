# ADR-0010: Backend em TypeScript com Node e Express

**Status:** Aceita
**Data:** 2026-11-17

## Contexto

O professor exigiu que o projeto seja inteiramente em TypeScript, seguindo o repositório de referência da disciplina (`felipez3r0/exemplo-api-2ads`): Node, Express, Zod, `tsx` e arquitetura em camadas. O backend ainda não tinha código de aplicação; só o esqueleto Java e o `pom.xml`.

O sistema também será usado comercialmente com cliente definido, então a troca não pode perder o que já foi decidido sobre banco, idempotência, revisão e contrato.

## Decisão

- **Linguagem:** TypeScript em modo estrito (`strict`, `noUncheckedIndexedAccess`).
- **Runtime:** Node.js LTS, fixado em `engines` e `.nvmrc`.
- **HTTP:** Express 5, com camadas Routes → Controller → Service → Repository, como no exemplo da disciplina.
- **Validação:** Zod 4, com erros traduzidos para os códigos `INVALID_*` do catálogo de erros.
- **Acesso a dados:** `pg` (node-postgres) com SQL parametrizado escrito à mão. Não há ORM. Essa é a mesma regra do ADR-0002, reaplicada ao ecossistema Node.
- **Migrations:** runner próprio em `src/database/migrate.ts`, que aplica `V<n>__*.sql` em ordem, cada uma em transação, e registra em `schema_migrations`. Os arquivos SQL V1 a V9 seguem sem alteração.
- **Testes:** Vitest, com `@testcontainers/postgresql` para o PostgreSQL real e `supertest` para HTTP. Os projetos `unit` e `integration` substituem a filtragem por tags do JUnit.
- **Qualidade:** ESLint, Prettier e `tsc --noEmit` no CI.
- **Banco:** PostgreSQL 16, mantido pelo ADR-0001.

## Consequências

- O banco, o índice único parcial, a idempotência por `actionId`, a revisão condicional e o contrato de endpoints não mudam (ADR-0001, 0006, 0007 e contrato).
- A garantia de que dupla reserva e idempotência são provadas no banco real (ADR-0003) continua. Só muda a ferramenta: Testcontainers para Node.
- O `Clock` único por requisição (ADR-0005) vira uma interface `Clock` injetada, com a mesma regra de proibir `new Date()` e `Date.now()` fora dela.
- O CORS (ADR-0008) passa a ser o middleware `cors`, configurado pela variável `CORS_ALLOWED_ORIGINS`. A decisão de origem configurável continua.
- A carga de demonstração deixa de depender de perfil Spring (ADR-0009), e passa a ser o script `npm run db:seed` (ADR-0011).
- O pacote por feature (ADR-0004) é substituído por pastas por tipo de camada, como no exemplo.

## Alternativas consideradas

- **Fork do repositório da disciplina:** cria uma cópia sem ganho, e dificulta a manutenção comercial. Descartado.
- **Repositório novo:** perde o histórico dos PRs, dos ADRs e das decisões de contrato. Descartado.
- **SQLite, como no exemplo:** não tem índice parcial com a mesma semântica, nem `TIMESTAMPTZ`, e não serve à concorrência real de reservas. Descartado para uso comercial.
- **NestJS:** traz uma estrutura pesada e opinativa que o exemplo não usa. Descartado.
- **Fastify:** tecnicamente sólido, mas foge da estrutura que a disciplina mostra e que os alunos já conhecem. Descartado.
