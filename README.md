# Kenko API

API REST do sistema de atendimento e agendamento automatizado da clínica Kenko. Um bot determinístico, executado no backend, conduz o paciente por menus, consulta horários, confirma e cancela consultas. Um painel somente leitura apresenta a agenda e os indicadores do atendimento.

Projeto acadêmico, desenvolvido para a disciplina interdisciplinar do segundo semestre do curso de Análise e Desenvolvimento de Sistemas. Os dados da demonstração são fictícios, mas as operações são reais: consultar disponibilidade lê o banco, confirmar cria uma reserva e os indicadores são calculados por queries.

> **Estado atual:** a API está completa para a demonstração: bot de agendamento, painel (Home, Calendário, Dia e Analytics) e tratamento de erros. As migrations V1 a V23 são aplicadas pelo runner, e a carga de demonstração (`npm run db:seed`) cria clínica, horários e conversas fictícias. Para testar os endpoints de ponta a ponta, use o arquivo `requests.http`. A entrega acadêmica está em `docs/entrega/`.

## Sumário

- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Como começar](#como-começar)
- [Comandos](#comandos)
- [Documentação](#documentação)
- [Convenções](#convenções)
- [Fora do escopo](#fora-do-escopo)

## Funcionalidades

**Bot de agendamento (Showcase)**

- Menu automático ao iniciar a conversa, sem necessidade de digitar texto.
- Triagem em duas perguntas: especialidade e primeira consulta ou retorno.
- Oferta de até três horários, respeitando a distribuição semanal (dois dias na semana atual e um na seguinte).
- Identificação do paciente (nome e nascimento) na primeira reserva; reservas seguintes da mesma conversa reutilizam esse paciente.
- Consulta e cancelamento apenas das reservas feitas na própria conversa.
- Informações da clínica lidas do banco.
- Proteção contra dupla reserva, mesmo com várias conversas disputando o mesmo horário.

**Painel (somente leitura)**

- **Home:** resumo mensal, melhor dia, hora de pico, melhor sala, mediana de atendimento e próximas consultas.
- **Calendário:** grade mensal com o total de consultas por data.
- **Dia:** detalhamento de uma data, com status, distribuição por hora, manhã e tarde, e ocupação por sala.
- **Analytics:** funil de conversão, términos, histograma e P90 de duração, mapa de calor, série de conclusão e buscas sem horário, com filtros de semana, mês e ano.

## Tecnologias

| Área | Tecnologia |
|---|---|
| Linguagem | TypeScript em modo estrito |
| Runtime | Node.js 24 (ver `.nvmrc`) |
| Framework HTTP | Express 5 |
| Validação | Zod 4 |
| Banco de dados | PostgreSQL 16 |
| Acesso a dados | `pg`, com SQL parametrizado escrito à mão (sem ORM) |
| Migrations | Runner próprio em TypeScript, sobre arquivos `V<n>__*.sql` |
| Testes | Vitest, supertest e Testcontainers (PostgreSQL real) |
| Qualidade | ESLint, Prettier e `tsc --noEmit` |

As decisões estão nos ADRs: [ADR-0010](docs/adr/0010-backend-typescript.md) (backend em TypeScript) e [ADR-0001](docs/adr/0001-postgresql.md) (PostgreSQL).

## Estrutura do repositório

```text
kenko-api/
  docs/                  documentação técnica: ADRs, modelo de dados, endpoints, testes, seeds
  src/
    app.ts               monta o Express: CORS, JSON, /health, /api e erros
    server.ts            inicializa a aplicação e escuta a porta configurada
    config/              variáveis de ambiente validadas com Zod e pool do pg
    controllers/         adaptam HTTP ao serviço e respondem com o envelope
    database/
      migrate.ts         aplica as migrations pendentes e registra em schema_migrations
      migrations/        V1 a V23: modelo de dados, roteiro do bot e índices em SQL
    errors/              AppError e catálogo de códigos com status HTTP
    middlewares/         tratamento central de erros
    models/              tipos dos dados como estão no banco
    repositories/        única camada que fala com o banco
    routes/              URLs e métodos HTTP
    services/            regras de negócio, sem HTTP nem SQL
    shared/              relógio com fuso de negócio, identificadores opacos e envelope
  tests/
    unit/                regras puras, sem banco
    integration/         API com PostgreSQL real pelo Testcontainers
    support/             helpers compartilhados pelos testes
  compose.yaml           PostgreSQL 16 para desenvolvimento local
  requests.http          fluxo completo do bot e do painel, para o REST Client do VS Code
  package.json, tsconfig*.json, vitest.config.mts, eslint.config.mjs
```

Cada camada só conversa com a imediatamente abaixo: rotas → controller → serviço → repositório → banco. O guia completo da arquitetura está no ADR-0010.

## Como começar

Pré-requisitos: Node.js 24 e Docker. Não é preciso instalar PostgreSQL localmente: o banco de desenvolvimento roda em container, e os testes sobem o próprio.

```bash
git clone https://github.com/devbianchi/kenko-api.git
cd kenko-api
npm ci
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

A API sobe em `http://localhost:8080`. Para confirmar:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/docs # Especificação OpenAPI completa em JSON, sem acessar o banco
curl http://localhost:8080/api/clinic   # 200 com a demonstração carregada; 404 CLINIC_NOT_FOUND sem ela
```

O guia completo está em [Desenvolvimento local](docs/desenvolvimento-local/README.md).

`npm run dev` e `npm run build` geram automaticamente os bundles OpenAPI antes da execução.
O servidor carrega `dist/openapi/openapi.json` antes de abrir a porta e o disponibiliza em
`GET /api/docs`, sem envelope `meta/data`. A entrega de produção deve incluir `dist/openapi/`;
`npm start` apenas executa o artefato pronto, sem ferramentas de documentação no runtime.

## Comandos

| Tarefa | Comando |
|---|---|
| Instalar dependências | `npm ci` |
| Rodar a API com recarga | `npm run dev` |
| Compilar para `dist/` | `npm run build` |
| Rodar a versão compilada | `npm start` |
| Aplicar migrations pendentes | `npm run db:migrate` |
| Carregar a demonstração | `npm run db:seed` |
| Checar tipos | `npm run typecheck` |
| Lint | `npm run lint` |
| Formatar | `npm run format` |
| Todos os testes | `npm test` |
| Só unitários | `npm run test:unit` |
| Só integração (exige Docker) | `npm run test:integration` |
| Cobertura | `npm run test:coverage` |
| Validar OpenAPI, exemplos e gerar bundles | `npm run docs:check` |
| Gerar OpenAPI única em YAML e JSON | `npm run docs:bundle` |

## Documentação

| Documento | Conteúdo |
|---|---|
| [Desenvolvimento local](docs/desenvolvimento-local/README.md) | Pré-requisitos, primeira execução, comandos do dia a dia e problemas comuns |
| [Configuração](docs/desenvolvimento-local/configuracao.md) | Variáveis de ambiente e o fuso de negócio |
| [Banco local](docs/desenvolvimento-local/banco-local.md) | PostgreSQL em container, reset e verificação das migrations |
| [Modelo de dados](docs/modelo-de-dados/README.md) | Tabelas, constraints, índices e sequência de migrations |
| [Endpoints](docs/endpoint/README.md) | Contratos REST, formatos JSON, erros e interações do bot |
| [OpenAPI](docs/openapi/README.md) | Especificação completa, exemplos, validação e bundles para documentação Swagger separada |
| [Catálogo de erros](docs/catalogo-de-erros/README.md) | Códigos de erro, status HTTP e o que o cliente deve fazer |
| [Estratégia de testes](docs/estrategia-de-testes/README.md) | Níveis de teste, convenções e critérios de pronto |
| [Dados de teste](docs/estrategia-de-testes/dados-de-teste.md) | Relógio fixo, base com PostgreSQL e cenários reutilizáveis |
| [Seeds de demonstração](docs/seeds-demonstracao/README.md) | Dados fictícios para o painel e o bot, e a estratégia de datas |
| [Entrega acadêmica](docs/entrega/README.md) | Checklist dos requisitos, roteiro da apresentação, recarga da demonstração e ensaio |
| [Desempenho](docs/desempenho/README.md) | Medição das consultas, índices e decisões de desempenho |
| [ADRs](docs/adr/README.md) | Decisões de arquitetura registradas, da escolha do PostgreSQL à proteção contra dupla reserva |

Os requisitos funcionais, as regras de negócio e as métricas estão no escopo consolidado do projeto, em [docs/escopo](docs/escopo/escopo-kenko-v2.md).

## Convenções

**Regras de negócio**

- Todas as datas e comparações usam `America/Sao_Paulo`, independentemente do fuso do servidor (ADR-0005).
- O status das consultas é derivado (cancelada, completa ou pendente). Não há coluna de status nem registro de faltas.
- Conversas abandonadas após uma hora de inatividade são calculadas por query, não gravadas, e não são retomadas.
- A transcrição do chat fica no navegador; o banco guarda apenas fatos estruturados.

**Código e testes**

- Regras puras são testadas sem banco; garantias do banco (dupla reserva, idempotência, revisão) são provadas em PostgreSQL real.
- Nenhum teste depende do relógio real. Usa-se um `Clock` fixo, injetado (`src/shared/clock.ts`).
- Nomes de testes descrevem o comportamento, no padrão `acao_resultado_quando_condicao`, por exemplo `rejeita_segunda_reserva_do_mesmo_horario`.
- Migrations já aplicadas não são editadas; uma correção vira nova versão.

**Commits**

Mensagens em português, no formato `tipo(escopo): Descrição`, com a linha de título abaixo de 72 caracteres:

```text
feat(agendamento): Adiciona revalidação do horário antes da confirmação

- Impede confirmação de horário ocupado após a seleção
- Retorna 409 SLOT_UNAVAILABLE com novas opções
```

Tipos aceitos: `feat`, `fix`, `refactor`, `test`, `chore` e `docs`.

## Fora do escopo

- Autenticação e autorização: a demonstração é aberta por definição.
- Integração com WhatsApp, inteligência artificial ou outros canais.
- CRUD público de pacientes, médicos, salas, especialidades e horários.
- Edição, remarcação ou exclusão de consultas pelo painel.
- Exportação de dados e relatórios genéricos.
