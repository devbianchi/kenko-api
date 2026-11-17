# Desenvolvimento local — Kenko API

Como preparar o ambiente, subir a API e rodar os testes na sua máquina.

Documentos relacionados:

- [Configuração](configuracao.md): variáveis de ambiente e fuso de negócio
- [Banco local](banco-local.md): PostgreSQL e problemas comuns
- [Modelo de dados](../modelo-de-dados/README.md): schema e migrations
- [ADRs](../adr/README.md): decisões de arquitetura

> **Estado atual:** a base da aplicação está pronta. A API sobe, `GET /health` responde, `GET /api/clinic` responde 404 até a clínica ser cadastrada, e as migrations V1 a V19 são aplicadas pelo runner. Os endpoints do bot e do painel entram nas próximas fases.

## Pré-requisitos

| Ferramenta | Versão | Verificação |
|---|---|---|
| Node.js | 24 (ver `.nvmrc`) | `node --version` |
| npm | acompanha o Node | `npm --version` |
| Docker | 24 ou superior | `docker version` |
| Git | qualquer recente | `git --version` |

Não é preciso instalar PostgreSQL localmente. O desenvolvimento usa o container descrito em [banco-local.md](banco-local.md), e os testes sobem o próprio container pelo Testcontainers ([ADR-0003](../adr/0003-testcontainers.md)).

Para usar a versão do `.nvmrc` com o nvm: `nvm install && nvm use`.

## Primeira execução

```bash
git clone https://github.com/devbianchi/kenko-api.git
cd kenko-api
npm ci
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run dev
```

- `npm ci` instala as dependências exatamente como estão no `package-lock.json`.
- `cp .env.example .env` cria a configuração local. Ela aponta para o banco do `compose.yaml`.
- `npm run db:migrate` aplica as migrations de V1 a V19. Rodar de novo não faz nada se não houver pendências.
- `npm run dev` sobe a API em `http://localhost:8080` com recarga automática.

Confirmar que está no ar:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/clinic
```

A primeira resposta é `{"status":"ok"}`. A segunda é 404 `CLINIC_NOT_FOUND`, que é o esperado até a clínica ser cadastrada (Fase 3).

## Comandos do dia a dia

| Tarefa | Comando |
|---|---|
| Rodar a API com recarga | `npm run dev` |
| Compilar para `dist/` | `npm run build` |
| Rodar a versão compilada | `npm start` (depois do `build`) |
| Aplicar migrations pendentes | `npm run db:migrate` |
| Checar tipos | `npm run typecheck` |
| Lint | `npm run lint` |
| Formatar | `npm run format` |
| Todos os testes | `npm test` |
| Só unitários (sem Docker) | `npm run test:unit` |
| Só integração (exige Docker) | `npm run test:integration` |
| Um arquivo de teste | `npx vitest run tests/unit/opaque-id.test.ts` |
| Cobertura | `npm run test:coverage` |
| Limpar o banco local | `docker compose down -v && docker compose up -d db && npm run db:migrate` |

Os testes de integração sobem um PostgreSQL 16 descartável e exigem Docker em execução. Se o Docker estiver parado, eles falham na inicialização do container, não no código.

## Ciclo de trabalho recomendado

1. Atualize a branch principal: `git switch main` e `git pull --ff-only`.
2. Crie a branch da tarefa com nome descritivo, sem o nome de ferramentas de IA. Ex.: `feat/clinic-resource`.
3. Rode `npm test` antes de começar, para confirmar o estado inicial.
4. Desenvolva em pequenos passos, rodando o teste relacionado a cada mudança.
5. Antes do commit, rode `npm run typecheck`, `npm run lint` e `npm test`.

## Quando algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `Configuração inválida: DATABASE_URL` | `.env` ausente ou sem a variável | `cp .env.example .env` e confira o valor. |
| `ECONNREFUSED` na porta 5432 | Container do banco parado | `docker compose up -d db`. |
| `password authentication failed` | `DATABASE_URL` diferente do container | Confira o `.env` com o `compose.yaml`. |
| `Falha ao aplicar V<n>__...` | Migration com erro ou banco com dados fora do esperado | Veja [banco-local.md](banco-local.md#migrations-falham). |
| `Could not find a valid Docker environment` nos testes | Docker parado | Inicie o Docker e rode o teste de novo. |
| `Cannot find module` ao rodar | Dependências não instaladas | `npm ci`. |
| Porta 8080 ocupada | Outra aplicação em uso | Defina `PORT=8081` no `.env` ou encerre o processo. |
| Versão do Node diferente | Node fora da versão 24 | `nvm install && nvm use`, ou instale a versão de `.nvmrc`. |

Para o estado completo do banco, consulte [banco-local.md](banco-local.md).
