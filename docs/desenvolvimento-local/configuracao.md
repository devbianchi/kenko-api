# Configuração e perfis

A configuração fica em `src/main/resources/application.properties` e em arquivos por perfil. Credenciais nunca são versionadas: vêm de variáveis de ambiente.

## Propriedades principais

| Propriedade | Padrão | Descrição |
|---|---|---|
| `spring.application.name` | `kenko-api` | Já definida. |
| `server.port` | `8080` | Porta HTTP. |
| `spring.datasource.url` | `${DB_URL}` | URL JDBC do PostgreSQL. |
| `spring.datasource.username` | `${DB_USER}` | Usuário do banco. |
| `spring.datasource.password` | `${DB_PASSWORD}` | Senha. Sem valor padrão. |
| `spring.flyway.enabled` | `true` | Aplica as migrations na inicialização. |
| `kenko.timezone` | `America/Sao_Paulo` | Fuso de negócio usado pelo bean `Clock`. |
| `kenko.cors.allowed-origins` | `http://localhost:5173` | Origem do frontend, separada por vírgula (ver [ADR-0008](../adr/0008-cors-e-origem-do-frontend.md)). |

Ao colocar `${DB_PASSWORD}` sem valor padrão, a aplicação falha na inicialização se a variável não existir. Isso é intencional: evita subir com credencial vazia.

## Variáveis de ambiente

| Variável | Obrigatória | Exemplo (dev) |
|---|---|---|
| `DB_URL` | sim | `jdbc:postgresql://localhost:5432/kenko` |
| `DB_USER` | sim | `kenko` |
| `DB_PASSWORD` | sim | `kenko` |
| `SERVER_PORT` | não | `8080` |
| `SPRING_PROFILES_ACTIVE` | não | `dev` |

Os valores de desenvolvimento estão no `compose.yaml`, descrito em [banco-local.md](banco-local.md). Não reutilize essas credenciais em nenhum outro ambiente.

### Como definir

**Linux/macOS (sessão atual):**

```bash
export DB_URL=jdbc:postgresql://localhost:5432/kenko
export DB_USER=kenko
export DB_PASSWORD=kenko
```

**Windows PowerShell (sessão atual):**

```powershell
$env:DB_URL = "jdbc:postgresql://localhost:5432/kenko"
$env:DB_USER = "kenko"
$env:DB_PASSWORD = "kenko"
```

Para não digitar a cada sessão, use um arquivo `.env` local (já ignorado pelo Git) ou as variáveis de usuário do sistema. O arquivo `.env.example` com as chaves, sem valores reais, é versionado.

## Perfis

| Perfil | Uso | Diferenças |
|---|---|---|
| (padrão, sem perfil) | Execução local | Usa as variáveis acima. |
| `dev` | Desenvolvimento com logs de SQL | `spring.jpa.show-sql` não se aplica (não usamos JPA). Ativa `logging.level.org.springframework.jdbc=DEBUG`. |
| `test` | Testes | Usa o container do Testcontainers. Não carrega a demonstração, pois não ativa `demo`. |
| `demo` | Apresentação | Carrega os seeds de demonstração após as migrations. É o único controle da carga ([ADR-0009](../adr/0009-carga-de-demonstracao-por-perfil.md)). Ver [documentação de seeds](../seeds-demonstracao/README.md). |

Ativar um perfil:

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

Ou pela variável `SPRING_PROFILES_ACTIVE=dev`.

## Fuso horário

A aplicação precisa do fuso `America/Sao_Paulo` nas regras de negócio, independentemente do fuso da máquina (ADR-0005). O bean `Clock` usa essa zona explicitamente.

Não é necessário alterar o fuso do sistema operacional. Porém, o PostgreSQL deve guardar `TIMESTAMPTZ` em UTC internamente e converter na leitura. Isso já é o comportamento padrão do tipo.

## Não versionar

- Senhas e tokens reais.
- Arquivos `.env` com valores.
- Diretórios `target/` e `coverage/`.

Verifique o `.gitignore` antes de cada commit que altere a configuração.