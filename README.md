# Kenko API

API REST do sistema de atendimento e agendamento automatizado da clínica Kenko. Um bot determinístico, executado no backend, conduz o paciente por menus, consulta horários, confirma e cancela consultas. Um painel somente leitura apresenta a agenda e os indicadores do atendimento.

Projeto acadêmico, desenvolvido para a disciplina interdisciplinar do segundo semestre do curso de Análise e Desenvolvimento de Sistemas. Os dados da demonstração são fictícios, mas as operações são reais: consultar disponibilidade lê o banco, confirmar cria uma reserva e os indicadores são calculados por queries.

> **Estado atual:** o projeto está na fase de base da aplicação. Hoje existem apenas a classe de inicialização e o teste de carga de contexto. Persistência, migrations e testes de integração entram na Fase 1. Os documentos em `docs/` descrevem o comportamento esperado.

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
| Linguagem | Java 25 |
| Framework | Spring Boot 4.1.1 |
| Build | Maven, via wrapper (`./mvnw`, Maven 3.9.16) |
| Banco de dados | PostgreSQL 16 |
| Acesso a dados | Spring JDBC com `JdbcClient` (ADR-0002) |
| Migrations | Flyway |
| Testes | JUnit 5, AssertJ, Mockito, Spring MockMvc, Testcontainers |

## Estrutura do repositório

```text
kenko-api/
  docs/                 documentação técnica: ADRs, modelo de dados, endpoints, testes, seeds
  src/main/java/        código da aplicação, organizado por feature (ADR-0004)
  src/main/resources/
    application.properties
    db/migration/       migrations Flyway (V1 a V9 nesta etapa)
  src/test/java/        testes unitários e de integração
  mvnw, mvnw.cmd        Maven wrapper
  pom.xml
```

As features seguem os pacotes previstos no ADR-0004 sob `com.kenko.kenko_api`: `calendar`, `dashboard`, `analytics`, `conversation` e `scheduling`, além de `shared` e `support` nos testes.

## Como começar

Pré-requisitos: JDK 25 e Docker. Não é preciso instalar Maven nem PostgreSQL localmente; o wrapper baixa o Maven e os testes sobem seu próprio banco.

```bash
git clone https://github.com/devbianchi/kenko-api.git
cd kenko-api
./mvnw -v
```

No Windows, use `mvnw.cmd` no lugar de `./mvnw`.

Para subir a aplicação:

```bash
./mvnw spring-boot:run
```

A API sobe em `http://localhost:8080`. Nesta etapa ela ainda não expõe rotas, então `GET /api/clinic` responde 404, o que é esperado até a Fase 1.

Quando a Fase 1 estiver concluída, o banco local e o perfil de demonstração passam a funcionar. O guia completo está em [Desenvolvimento local](docs/desenvolvimento-local/README.md).

## Comandos

| Tarefa | Comando |
|---|---|
| Compilar | `./mvnw clean compile` |
| Rodar a aplicação | `./mvnw spring-boot:run` |
| Rodar todos os testes | `./mvnw test` |
| Rodar uma classe de teste | `./mvnw test -Dtest=NomeDaClasseTest` |
| Gerar o pacote | `./mvnw clean package` |
| Build completo com cobertura | `./mvnw verify` (relatório JaCoCo em `target/site/jacoco`, após a Fase 1) |

Após a Fase 1, os testes de integração usam Testcontainers e exigem Docker em execução.

## Documentação

| Documento | Conteúdo |
|---|---|
| [Desenvolvimento local](docs/desenvolvimento-local/README.md) | Pré-requisitos, primeira execução, comandos do dia a dia e problemas comuns |
| [Configuração e perfis](docs/desenvolvimento-local/configuracao.md) | Variáveis de ambiente, propriedades e perfis `dev`, `test` e `demo` |
| [Banco local](docs/desenvolvimento-local/banco-local.md) | PostgreSQL em container, reset e verificação das migrations |
| [Modelo de dados](docs/modelo-de-dados/README.md) | Tabelas, constraints, índices e sequência de migrations |
| [Endpoints](docs/endpoint/README.md) | Contratos REST, formatos JSON, erros e interações do bot |
| [Catálogo de erros](docs/catalogo-de-erros/README.md) | Códigos de erro, status HTTP e o que o cliente deve fazer |
| [Estratégia de testes](docs/estrategia-de-testes/README.md) | Níveis de teste, convenções e critérios de pronto |
| [Dados de teste](docs/estrategia-de-testes/dados-de-teste.md) | Relógio fixo, base com PostgreSQL e cenários reutilizáveis |
| [Seeds de demonstração](docs/seeds-demonstracao/README.md) | Dados fictícios para o painel e o bot, e a estratégia de datas |
| [ADRs](docs/adr/README.md) | Decisões de arquitetura registradas, da escolha do PostgreSQL à proteção contra dupla reserva |

Os requisitos funcionais, as regras de negócio e as métricas estão no escopo consolidado do projeto, mantido fora deste repositório.

## Convenções

**Regras de negócio**

- Todas as datas e comparações usam `America/Sao_Paulo`, independentemente do fuso do servidor (ADR-0005).
- O status das consultas é derivado (cancelada, completa ou pendente). Não há coluna de status nem registro de faltas.
- Conversas abandonadas após uma hora de inatividade são calculadas por query, não gravadas, e não são retomadas.
- A transcrição do chat fica no navegador; o banco guarda apenas fatos estruturados.

**Código e testes**

- Regras puras são testadas sem banco; garantias do banco (dupla reserva, idempotência, revisão) são provadas em PostgreSQL real.
- Nenhum teste depende do relógio real. Usa-se `Clock` fixo.
- Nomes de métodos de teste seguem `acao_resultado_quando_condicao`, por exemplo `rejeita_segunda_reserva_do_mesmo_horario`.
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
