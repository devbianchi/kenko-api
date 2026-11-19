# Checklist da entrega

Cada linha diz o que a disciplina pede, onde está no repositório e o estado atual. Não há item marcado sem evidência.

| Requisito | Evidência no repositório | Estado |
|---|---|---|
| Código inteiramente em TypeScript | `src/` e `tests/` em `.ts`; `tsconfig.json` com `strict` e `noUncheckedIndexedAccess` | Atendido |
| Node.js | `.nvmrc` com a versão 24; `engines` no `package.json` | Atendido |
| Express | `src/app.ts`, `src/routes/` | Atendido |
| Zod para validação | `src/schemas/` (corpos de conversa e de interação) | Atendido |
| tsx para executar em desenvolvimento | script `dev` com `tsx watch` e scripts `db:migrate` e `db:seed` com `tsx` | Atendido |
| Arquitetura em camadas | Rotas, controllers, serviços e repositórios em `src/`, com a regra de cada camada em [ADR-0010](../adr/0010-backend-typescript.md) | Atendido |
| Modelos com tipos TypeScript | `src/models/` | Atendido |
| Erros e validações padronizados | Catálogo em [catalogo-de-erros](../catalogo-de-erros/README.md) e `src/errors/error-codes.ts`; envelope de erro no middleware | Atendido |
| Validação com códigos de erro claros | Zod nos corpos; validadores manuais para parâmetros de consulta, todos com códigos `INVALID_*` | Atendido |
| Banco de dados com SQL | PostgreSQL 16 com SQL parametrizado e migrations em `src/database/migrations/` | Atendido |
| Seed de demonstração | `npm run db:seed`, com carga idempotente e recusa em base que não é de demonstração | Atendido |
| Arquivo `requests.http` com o fluxo | `requests.http` na raiz, executado por teste de integração | Atendido |
| README com passo a passo | [README](../../README.md) e [desenvolvimento local](../desenvolvimento-local/README.md) | Atendido |
| Testes automatizados | Suíte com testes unitários e de integração em PostgreSQL real, executada por `npm test` | Atendido |
| Escopo e análise | [escopo](../escopo/escopo-kenko-v2.md), [contrato de endpoints](../endpoint/README.md), [critérios VAL](../estrategia-de-testes/criterios.md) | Atendido |
| Painel em tela (Home, Calendário, Dia, Analytics) | Os endpoints estão implementados e testados aqui. A interface fica em outro repositório e não foi executada neste ensaio. | Parcial: backend atendido, tela não verificada aqui |
| SGBD livre | Liberado pelo professor. Usamos PostgreSQL. | Atendido |

## Pendências conhecidas

- A tela do painel e o frontend do Showcase não estão neste repositório. Antes da apresentação, é preciso subir o frontend contra a API e confirmar os quatro painéis.
- Os textos do roteiro do bot foram conferidos com o contrato, mas a revisão de redação ainda é do time.
