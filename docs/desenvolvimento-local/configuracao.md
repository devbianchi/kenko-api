# Configuração

A configuração vem de variáveis de ambiente. Elas são lidas e validadas uma vez, na inicialização, por `src/config/env.ts` (Zod). Se uma variável obrigatória faltar ou for inválida, a aplicação não sobe e a mensagem diz qual é o problema.

Credenciais nunca são versionadas. O arquivo `.env.example` mostra as chaves, sem valores reais.

## Variáveis

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `DATABASE_URL` | sim | nenhum | URL de conexão do PostgreSQL, por exemplo `postgresql://kenko:kenko@localhost:5432/kenko`. |
| `PORT` | não | `8080` | Porta HTTP. |
| `CORS_ALLOWED_ORIGINS` | não | `http://localhost:5173` | Origens do frontend, separadas por vírgula ([ADR-0008](../adr/0008-cors-e-origem-do-frontend.md)). |
| `NODE_ENV` | não | `development` | `development`, `test` ou `production`. |
| `KENKO_DB_PORT` | não | `5432` | Porta do banco do `docker compose` no seu computador. Lida pelo `compose.yaml`, não pela API: ao trocá-la, use a mesma porta na `DATABASE_URL`. |

Não há valor padrão para `DATABASE_URL`. Se ela estiver ausente, a aplicação falha com `Configuração inválida: DATABASE_URL: ...`. Isso é intencional: evita subir apontando para um banco inesperado.

## Como definir

**Arquivo `.env` na raiz (recomendado para desenvolvimento):**

```bash
cp .env.example .env
```

O `.env` é carregado automaticamente pelo `dotenv`, que roda na primeira linha de `src/config/env.ts`. Ele já está no `.gitignore`.

**Linux/macOS, sessão atual:**

```bash
export DATABASE_URL=postgresql://kenko:kenko@localhost:5432/kenko
```

**Windows PowerShell, sessão atual:**

```powershell
$env:DATABASE_URL = "postgresql://kenko:kenko@localhost:5432/kenko"
```

Os valores de desenvolvimento estão no `compose.yaml`, descrito em [banco-local.md](banco-local.md). Não reutilize essas credenciais em nenhum outro ambiente.

## Fuso horário

As regras de negócio usam `America/Sao_Paulo`, independentemente do fuso da máquina (ADR-0005). A constante `BUSINESS_TIMEZONE` fica em `src/shared/clock.ts`, e não é configurável por variável de ambiente, porque o fuso faz parte da regra de negócio.

O tempo nunca é lido diretamente. Toda regra que depende dele recebe um `Clock`, que é uma interface injetada. Em produção usa-se `systemClock`; nos testes, `fixedClock`. Isso mantém os testes independentes do relógio real.

O PostgreSQL guarda `TIMESTAMPTZ` em UTC e converte na leitura. Não é preciso alterar o fuso do sistema operacional.

## Não versionar

- Senhas e tokens reais.
- Arquivos `.env` com valores.
- Diretórios `dist/` e `coverage/`.

Verifique o `.gitignore` antes de cada commit que altere a configuração.
