# Banco local

O desenvolvimento usa PostgreSQL em container, definido em `compose.yaml` na raiz do projeto. Os testes de integração usam Testcontainers e não dependem desse container.

## Subir o banco

```bash
docker compose up -d db
```

Verificar:

```bash
docker compose ps
docker compose logs db --tail 20
```

O serviço está pronto quando o log mostra `database system is ready to accept connections`.

## Conexão

| Parâmetro | Valor |
|---|---|
| Host | `localhost` |
| Porta | `5432` |
| Banco | `kenko` |
| Usuário | `kenko` |
| Senha | `kenko` |
| Versão | PostgreSQL 16 (alinhada à [ADR-0001](../adr/0001-postgresql.md)) |

Cliente de linha de comando:

```bash
docker compose exec db psql -U kenko -d kenko
```

Para conectar por DBeaver, pgAdmin ou IntelliJ, use os parâmetros acima. A mesma conexão, em forma de URL, é a `DATABASE_URL` do `.env`.

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

volumes:
  kenko-db:
```

O volume `kenko-db` mantém os dados entre reinicializações. A seção seguinte mostra como limpar.

## Resetar o banco

Remove o volume e recria o container. As migrations são aplicadas de novo com `npm run db:migrate`.

```bash
docker compose down -v
docker compose up -d db
npm run db:migrate
```

Use com cuidado: apaga todos os dados locais, incluindo os seeds de demonstração carregados.

## Ver as tabelas

```bash
docker compose exec db psql -U kenko -d kenko -c "\dt"
```

Após as migrations, devem aparecer as tabelas descritas em [migrations.md](../modelo-de-dados/migrations.md).

Para conferir o histórico de migrations aplicadas:

```bash
docker compose exec db psql -U kenko -d kenko -c "SELECT version, name, applied_at FROM schema_migrations ORDER BY version;"
```

Devem aparecer as 18 versões, de V1 a V18.

## Migrations falham

O runner (`src/database/migrate.ts`) aplica cada migration em uma transação. Se uma falhar, nada dela fica aplicado, e a mensagem indica o arquivo:

```text
Falha ao aplicar V9__schema_table_conversa.sql: <motivo do PostgreSQL>
```

Mensagens comuns e o que significam:

| Erro | Causa | Solução |
|---|---|---|
| `Falha ao aplicar V<n>__...` com `already exists` | O banco tem objetos criados fora do runner. | `docker compose down -v`, `docker compose up -d db` e `npm run db:migrate`. |
| `Falha ao aplicar V<n>__...` com `violates check constraint` | Dados já existentes não respeitam uma restrição nova. Em banco local vazio, isso não ocorre. | Resete o banco local. |
| `Versão de migration duplicada` | Dois arquivos com o mesmo número `V<n>`. | Renomeie para o próximo número livre. Nunca reutilize um número já aplicado. |
| `password authentication failed` | `DATABASE_URL` com senha diferente da do container. | Confira o `.env` com o `compose.yaml`. |
| `ECONNREFUSED` | Container do banco parado. | `docker compose up -d db`. |

Uma migration já aplicada em ambiente compartilhado nunca é editada. A correção vira uma nova versão.

## Testes e o banco local

Os testes de integração criam o próprio container do PostgreSQL pelo Testcontainers. Eles:

- não usam o banco da porta 5432;
- não alteram os dados do `docker compose`;
- aplicam as migrations do zero em cada suíte.

Se os testes passam e a API falha, o problema costuma estar nos seeds ou na `DATABASE_URL`, não nas migrations.
