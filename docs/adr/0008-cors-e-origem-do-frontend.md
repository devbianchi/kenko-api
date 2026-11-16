# ADR-0008: Origem do frontend liberada por CORS com configuração externa

**Status:** Aceita
**Data:** 2026-11-16

## Contexto

O painel e o bot do Showcase rodam em outra origem (`http://localhost:5173`, servidor de desenvolvimento do frontend). A API roda em `http://localhost:8080`. Navegadores bloqueiam, por padrão, respostas de outra origem sem o cabeçalho CORS correspondente.

A demonstração não tem autenticação (escopo), então não há cookies nem credenciais a proteger no transporte. Mesmo assim, a API precisa aceitar apenas a origem do frontend, e a origem muda entre ambientes.

## Decisão

- A configuração de CORS fica no pacote `shared` (ADR-0004), com `CorsConfigurationSource` do Spring.
- As origens permitidas vêm da propriedade `kenko.cors.allowed-origins`. O valor padrão de desenvolvimento é `http://localhost:5173`.
- Métodos permitidos: `GET` e `POST`. Cabeçalhos permitidos: `Content-Type`.
- `allowCredentials` fica desativado, porque não há sessão nem cookie.
- A propriedade aceita mais de uma origem, separadas por vírgula, para ambientes de demonstração em outro endereço.

## Consequências

- Trocar a origem do frontend não exige alterar código, só a configuração.
- Sem credenciais, a configuração fica simples e fácil de testar com MockMvc (teste H, ADR-0003).
- Se a demonstração ganhar autenticação, este ADR precisa ser revisto, porque `allowCredentials` e a lista de origens passam a ter efeito de segurança.

## Alternativas consideradas

- **Proxy no servidor de desenvolvimento do frontend:** elimina CORS em desenvolvimento, mas acopla o frontend a um proxy e não funciona igual nos outros ambientes. Descartado.
- **Liberar qualquer origem (`*`):** mais simples, mas aceita origem não prevista sem nenhum custo de configuração a menos. Descartado.
