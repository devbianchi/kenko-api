# Dados de teste

Como preparar os cenários de teste sem depender do relógio real, de dados de demonstração nem de outros testes.

## Relógio fixo

Todo teste que envolve tempo recebe um `Clock` fixo, criado em `shared`:

```java
Clock relogio = Clock.fixed(
    Instant.parse("2026-11-10T15:00:00Z"),   // 12:00 em America/Sao_Paulo
    ZoneId.of("America/Sao_Paulo"));
```

Instante padrão para os testes: **10/11/2026, 12:00 em Brasília**. É uma terça-feira, dentro de uma semana completa, o que facilita os cenários de distribuição.

Para testar um instante específico, o teste cria um `Clock` próprio. Não se altera o relógio global nem se usa `Thread.sleep`.

## Base de integração com PostgreSQL

Uma classe base abstrata em `support/` sobe o container uma vez por execução e aplica as migrations:

```java
@SpringBootTest
@Testcontainers
@Tag("integration")
public abstract class IntegracaoBase {

    @Container
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void configurarBanco(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
}
```

Regras de uso:

- Todas as classes de integração herdam dessa base, para compartilhar o container.
- Cada teste começa com o banco no estado das migrations e um cenário próprio.
- Limpeza após cada teste com `@Transactional` (rollback automático) ou com `TRUNCATE` nas tabelas tocadas. Testes de concorrência não usam `@Transactional`, porque precisam de transações independentes.

## Cenários reutilizáveis

Os cenários ficam em `support/`, como classes que inserem dados por SQL explícito. Cada um cria apenas o necessário e devolve os identificadores para o teste.

| Cenário | Conteúdo | Usado por |
|---|---|---|
| `ClinicaBasica` | Clínica, expediente Seg–Sex 07h–18h e Sáb 09h–13h, quatro especialidades, médicos e seis salas. | Quase todos os de integração. |
| `HorariosSemanais` | Horários de 09h às 10h em dias úteis da semana de 10/11/2026, com dois médicos. | Busca de horários e reserva. |
| `ConversaComMenu` | Conversa ativa no passo `menu`, sem paciente. | Interações e idempotência. |
| `ConversaComReserva` | Conversa com uma reserva pendente e paciente vinculado. | Cancelamento, listagem, segunda reserva. |
| `ConversaAbandonada` | Conversa com última interação há mais de uma hora. | Abandono. |
| `HistoricoDoMes` | Conversas, eventos e reservas de outubro/2026 com todos os términos. | Analytics e Home. |

Cenários não são fixtures globais. Um cenário cria seus dados dentro da transação ou da limpeza do próprio teste.

## Dados fixos recomendados

Para facilitar a leitura dos testes, use os mesmos valores em todos os cenários:

| Entidade | Valor |
|---|---|
| Clínica | "Clínica Teste", endereço e telefone fictícios |
| Especialidades | Clínico geral, Dermatologia, Ortopedia, Cardiologia |
| Médica | Dra. Helena (Dermatologia) |
| Salas | Sala 1 a Sala 6 |
| Paciente | Ana Silva, nascimento 15/04/1998 |
| Contato | `contato_1`, `contato_2` |

Não reutilize os números dos exemplos de JSON da documentação de API como dados de teste. Eles servem à demonstração e não devem ser fixados nos asserts.

## Asserções sobre instantes

- Compare instantes com `Instant` ou `OffsetDateTime` convertidos para a mesma zona. Não compare strings.
- Ao verificar um horário de negócio, converta para `America/Sao_Paulo` antes de asserir a hora. Assim o teste não passa só porque a máquina estava no mesmo fuso.
- Use `isEqualTo` para instantes exatos e `isBefore`/`isAfter` para intervalos.

## Sementes aleatórias

Não use dados aleatórios em testes. Se um cenário precisar de volume, gere os valores com um índice determinístico (`"contato_" + i`). Assim, uma falha sempre reproduz.

## Limpeza entre execuções

| Situação | Estratégia |
|---|---|
| Teste de repositório ou serviço (uma thread) | `@Transactional` com rollback. |
| Teste de concorrência | `TRUNCATE` das tabelas tocadas em `@BeforeEach`. |
| Teste de migration | Banco novo, sem reaproveitamento do container. |

## O que não fazer

- Não chamar `Instant.now()`, `LocalDate.now()` ou `System.currentTimeMillis()` dentro de um teste ou da aplicação.
- Não depender da ordem de execução dos testes.
- Não compartilhar um `Clock`, uma lista ou um objeto mutável entre testes.
- Não usar `Thread.sleep` para esperar efeitos. Use `CountDownLatch` ou `Awaitility` (se aprovado).
- Não criar dados de demonstração dentro dos testes. Os seeds são responsabilidade da documentação de seeds.