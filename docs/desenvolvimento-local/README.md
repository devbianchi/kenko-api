# Desenvolvimento local — Kenko API

Como preparar o ambiente, subir a API e rodar os testes na sua máquina.

Documentos relacionados:

- [Configuração e perfis](configuracao.md): variáveis de ambiente e propriedades
- [Banco local](banco-local.md): PostgreSQL e problemas comuns
- [Modelo de dados](../modelo-de-dados/README.md): schema e migrations
- [ADRs](../adr/README.md): decisões de arquitetura

> **Estado atual:** o projeto ainda não tem datasource, Flyway, JDBC nem Testcontainers. Os comandos marcados com ⚠️ só funcionam depois da Fase 1 (base da aplicação). Os demais já funcionam.

## Pré-requisitos

| Ferramenta | Versão | Verificação |
|---|---|---|
| JDK | 25 | `java -version` |
| Docker | 24 ou superior | `docker version` |
| Git | qualquer recente | `git --version` |
| Maven | não precisa instalar; o wrapper baixa a versão 3.9.16 | `./mvnw -v` |

No Windows, use `mvnw.cmd` no lugar de `./mvnw`. O repositório já tem `.gitattributes` configurado para manter `mvnw` com final de linha LF.

PostgreSQL não precisa estar instalado localmente. Os testes sobem um container próprio (ADR-0003), e o desenvolvimento usa o container descrito em [banco-local.md](banco-local.md).

## Primeira execução

```bash
git clone <url-do-repositorio>
cd kenko-api
./mvnw -v
```

O primeiro `./mvnw -v` baixa o Maven para `~/.m2/wrapper`. Isso leva alguns minutos e só acontece uma vez.

Depois:

```bash
docker compose up -d db          # ⚠️ Fase 1
./mvnw spring-boot:run
```

A API sobe em `http://localhost:8080`. Ao iniciar, o Flyway aplica as migrations de V1 a V18 no banco.

Confirmar que está no ar:

```bash
curl http://localhost:8080/api/clinic
```

Com a Fase 1 concluída, a resposta é o JSON de clínica descrito no README da API. Antes disso, a resposta é 404, que é esperado.

## Comandos do dia a dia

| Tarefa | Comando |
|---|---|
| Compilar | `./mvnw clean compile` |
| Rodar a API | `./mvnw spring-boot:run` |
| Rodar todos os testes | `./mvnw test` ⚠️ |
| Rodar uma classe de teste | `./mvnw test -Dtest=NomeDaClasseTest` |
| Rodar um método de teste | `./mvnw test -Dtest=NomeDaClasseTest#metodo` |
| Gerar o pacote | `./mvnw clean package` |
| Limpar o banco local | `docker compose down -v && docker compose up -d db` ⚠️ |

Os testes de integração usam Testcontainers e exigem Docker em execução. Se o Docker estiver parado, eles falham na inicialização do container, não no código.

## Ciclo de trabalho recomendado

1. Atualize a branch principal: `git switch main` e `git pull --ff-only`.
2. Crie a branch da tarefa, como indicado no `git-workflow`.
3. Rode `./mvnw test` antes de começar, para confirmar o estado inicial.
4. Desenvolva em pequenos passos, rodando a classe de teste relacionada a cada mudança.
5. Antes do commit, rode a suíte completa.

## Quando algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `JAVA_HOME` não definido | JDK não instalado ou fora do PATH | Instale o JDK 25 e reabra o terminal. |
| Erro de versão do Java | JDK diferente de 25 | `java -version`; ajuste o `JAVA_HOME`. |
| `Could not find a valid Docker environment` | Docker parado | Inicie o Docker Desktop e rode o teste novamente. |
| `Connection refused` na porta 5432 | Container do banco parado | `docker compose up -d db`. |
| `contextLoads` falha após a Fase 1 | Migration com erro ou banco vazio | Veja [banco-local.md](banco-local.md#migrations-falham). |
| Flyway: `Validate failed` | Migration alterada depois de aplicada | Restaure o arquivo original ou limpe o banco local. Nunca edite uma migration já aplicada em ambiente compartilhado. |
| Porta 8080 ocupada | Outra aplicação em uso | Defina `SERVER_PORT=8081` ou encerre o processo. |

Para o estado completo do banco, consulte [banco-local.md](banco-local.md).