# Banco local

O desenvolvimento usa PostgreSQL em container, definido em `compose.yaml` na raiz do projeto. Os testes usam Testcontainers e não dependem desse container.

## Subir o banco

```bash
docker compose up -d db
```

Verificar:

```bash
docker compose ps
docker compose logs db --tail 20
```

O serviço fica saudável quando o log mostra `database system is ready to accept connections`.

## Conexão

| Parâmetro | Valor |
|---|---|
| Host | `localhost` |
| Porta | `5432` |
| Banco | `kenko` |
| Usuário | `kenko` |
| Senha | `kenko` |
| Versão | PostgreSQL 16 (alinhada à ADR-0001) |

Cliente de linha de comando:

```bash
docker compose exec db psql -U kenko -d kenko
```

Para conectar por DBeaver, pgAdmin ou IntelliJ, use os parâmetros acima.

## Conteúdo do `compose.yaml`

Referência do serviço, para conferência:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: kenko
      POSTGRES_USER: kenko
      POSTGRES_PASSWORD: kenko
    ports:
      - "5432:5432"
    volumes:
      - kenko-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kenko -d kenko"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  kenko-db:
```

O volume `kenko-db` mantém os dados entre reinicializações. A seção seguinte mostra como limpar.

## Resetar o banco

Remove o volume e recria o container. As migrations são aplicadas de novo na próxima execução da API.

```bash
docker compose down -v
docker compose up -d db
```

Use com cuidado: apaga todos os dados locais, incluindo os seeds de demonstração carregados.

## Ver as tabelas

```bash
docker compose exec db psql -U kenko -d kenko -c "\dt"
```

Após as migrations, devem aparecer as tabelas descritas em [migrations.md](../modelo-de-dados/migrations.md).

Para conferir a histórico do Flyway:

```bash
docker compose exec db psql -U kenko -d kenko -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;"
```

Todas as linhas devem ter `success = t`.

## Migrations falham

Mensagens comuns e o que significam:

| Erro | Causa | Solução |
|---|---|---|
| `column "nome" referenced in foreign key does not exist` ou `column "nome" ... does not exist` | V3 com a coluna errada (`nome` em vez de `nome_especialidade`). | Aplique a correção descrita em [migrations.md](../modelo-de-dados/migrations.md) antes de subir. |
| `check constraint ... is violated` | Dados inseridos pelo seed não respeitam o `CHECK` de `passo_roteiro.etapa`. | Revise o seed contra a lista de etapas (pendência P3). |
| `Validate failed: Migration checksum mismatch` | Arquivo de migration alterado depois de aplicado. | Em ambiente local: `docker compose down -v` e subir de novo. Em ambiente compartilhado: nunca edite; crie nova versão. |
| `relation "flyway_schema_history" already exists` | Banco criado manualmente, sem Flyway. | Resete o volume. |
| `password authentication failed` | `DB_PASSWORD` diferente da senha do container. | Confira as variáveis de ambiente com o `compose.yaml`. |

## Testes e o banco local

Os testes de integração criam o próprio container do PostgreSQL pelo Testcontainers. Eles:

- não usam o banco da porta 5432;
- não alteram os dados do `docker compose`;
- aplicam as migrations do zero em cada execução da classe de teste.

Se os testes passam e a API falha, o problema costuma estar nos seeds ou na configuração de `DB_URL`, não nas migrations.