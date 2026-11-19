# ADR-0008: Origem do frontend liberada por CORS com configuração externa

**Status:** Aceita (atualizada em 2026-11-19)
**Data:** 2026-11-16

## Contexto

O painel e o bot do Showcase rodam em outra origem (`http://localhost:5173`, servidor de desenvolvimento do frontend). A API roda em `http://localhost:8080`. Navegadores bloqueiam, por padrão, respostas de outra origem sem o cabeçalho CORS correspondente.

A demonstração não tem autenticação (escopo), então não há cookies nem credenciais a proteger no transporte. Mesmo assim, a API precisa aceitar apenas a origem do frontend, e a origem muda entre ambientes.

## Decisão

- A configuração de CORS fica em `src/app.ts`, com o middleware `cors` do Express (ADR-0010).
- As origens permitidas vêm da variável de ambiente `CORS_ALLOWED_ORIGINS`, lida em `src/config/env.ts`. O valor padrão de desenvolvimento é `http://localhost:5173`.
- A variável aceita mais de uma origem, separadas por vírgula, para ambientes de demonstração em outro endereço.
- Métodos permitidos: `GET` e `POST`. Cabeçalho permitido na requisição: `Content-Type`.
- Cabeçalho exposto na resposta: `X-Request-Id`, para o frontend mostrá-lo junto de um erro. Sem a exposição, o navegador esconde o cabeçalho de uma resposta de outra origem.
- Credenciais ficam desativadas, porque não há sessão nem cookie.

## Consequências

- Trocar a origem do frontend não exige alterar código, só a configuração.
- Sem credenciais, a configuração fica simples e é testada por HTTP com supertest (`tests/integration/api.it.test.ts`).
- Se a demonstração ganhar autenticação, este ADR precisa ser revisto, porque `allowCredentials` e a lista de origens passam a ter efeito de segurança.

## Alternativas consideradas

- **Proxy no servidor de desenvolvimento do frontend:** elimina CORS em desenvolvimento, mas acopla o frontend a um proxy e não funciona igual nos outros ambientes. Descartado.
- **Liberar qualquer origem (`*`):** mais simples, mas aceita origem não prevista sem nenhum custo de configuração a menos. Descartado.

## Atualização de 2026-11-19

A versão original descrevia a configuração em Spring. Com a migração do backend para TypeScript e Express (ADR-0010), a decisão continua a mesma, com outra implementação. Na integração com o frontend, o `X-Request-Id` passou a ser exposto.
