# ADR-0011: Carga de demonstração por script de seed

**Status:** Aceita
**Data:** 2026-11-17

## Contexto

O ADR-0009 definiu que a carga de demonstração é controlada pelo perfil Spring `demo`. Com a migração para TypeScript (ADR-0010), não existe perfil Spring. A decisão de fundo precisa continuar valendo: uma carga reproduzível, que não pode ser ligada por engano em ambiente com dados reais.

## Decisão

- A carga é um script TypeScript em `src/database/seed.ts`, executado com `npm run db:seed`. Ele não roda automaticamente ao subir a API.
- O script só roda com a variável `NODE_ENV` diferente de `production`. Se `DATABASE_URL` apontar para uma base marcada como não demonstrativa, ele se recusa a rodar. A marca é uma linha na tabela `clinica`, com o nome "Clínica Demonstração".
- A carga continua idempotente: remove apenas os registros de demonstração (contato com prefixo `demo_` e horários da janela de demonstração) e reinsere os fatos. Duas execuções produzem os mesmos fatos.
- As datas são relativas à data de execução, e não fixas (ADR-0009, sem alteração).
- O roteiro do bot continua vindo de migration, não da carga (ADR-0009, sem alteração).
- Os dados são escritos em SQL parametrizado dentro de uma transação, na mesma convenção dos repositórios.

## Consequências

- O mecanismo de ligar a carga passa a ser o comando explícito, o que mantém o controle único que o ADR-0009 buscava.
- A recusa em base não demonstrativa substitui a regra de "não usar o perfil em ambiente real", agora verificada pelo próprio script.
- Testes do script rodam como integração, contra PostgreSQL real (ADR-0010).

## Alternativas consideradas

- **Carga automática ao subir a API com variável de ambiente:** reintroduz o risco de carga acidental que o ADR-0009 quis evitar. Descartado.
- **Carga em migration:** datas fixas envelhecem e misturam dados de demonstração com o schema. Descartado, como no ADR-0009.
- **Endpoint administrativo:** fora do escopo, e exigiria autenticação. Descartado.
