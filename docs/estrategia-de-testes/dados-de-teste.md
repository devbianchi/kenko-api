# Dados de teste

Como preparar os cenários de teste sem depender do relógio real, de dados de demonstração nem de outros testes.

## Relógio fixo

Todo teste que envolve tempo recebe um `Clock` fixo, criado com `fixedClock` em `src/shared/clock.ts`:

```ts
import { fixedClock } from '../../src/shared/clock';

const relogio = fixedClock('2026-11-10T15:00:00Z'); // 12:00 em America/Sao_Paulo
```

Instante padrão para os testes: **10/11/2026, 12:00 em Brasília**. É uma terça-feira, dentro de uma semana completa, o que facilita os cenários de distribuição.

Para testar um instante específico, o teste cria um `Clock` próprio. Não se altera o relógio global nem se usa `setTimeout` para esperar o tempo passar.

## Base de integração com PostgreSQL

`tests/support/postgres.ts` sobe um PostgreSQL 16 descartável pelo Testcontainers e devolve o container e um `Pool` do `pg`:

```ts
import { afterAll, beforeAll } from 'vitest';
import type { Pool } from 'pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { startPostgres } from '../support/postgres';
import { loadMigrations, migrate } from '../../src/database/migrate';

let container: StartedPostgreSqlContainer;
let pool: Pool;

beforeAll(async () => {
  ({ container, pool } = await startPostgres());
  await migrate(pool, await loadMigrations());
}, 180_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
});
```

Regras de uso:

- Cada suíte de integração sobe o próprio container e aplica todas as migrations antes do primeiro teste.
- Cada teste prepara o que precisa e não depende do que outro teste deixou no banco.
- Limpeza após cada teste: `TRUNCATE` das tabelas tocadas, com `RESTART IDENTITY CASCADE`. Testes de repositório e de serviço podem usar uma transação com `ROLLBACK` no lugar, desde que todo o fluxo rode na mesma conexão.
- Testes de concorrência usam conexões independentes do pool, porque cada uma precisa de uma transação própria.

## Cenários reutilizáveis

Os cenários ficam em `tests/support/`, como funções que inserem dados por SQL explícito e devolvem os identificadores para o teste. Cada um cria apenas o necessário.

| Cenário | Conteúdo | Usado por |
|---|---|---|
| `clinicaBasica` | Clínica, expediente Seg–Sex 07h–18h e Sáb 09h–13h, quatro especialidades, médicos e seis salas. | Quase todos os de integração. |
| `horariosSemanais` | Horários de 09h às 10h em dias úteis da semana de 10/11/2026, com dois médicos. | Busca de horários e reserva. |
| `conversaComMenu` | Conversa ativa no passo `menu`, sem paciente. | Interações e idempotência. |
| `conversaComReserva` | Conversa com uma reserva pendente e paciente vinculado. | Cancelamento, listagem, segunda reserva. |
| `conversaAbandonada` | Conversa com última interação há mais de uma hora. | Abandono. |
| `historicoDoMes` | Conversas, eventos e reservas de outubro/2026 com todos os términos. | Analytics e Home. |

Os cenários são implementados junto com as funcionalidades que os usam. Hoje existem `resetClinica`, que limpa a clínica antes de cada teste, e `clinicaBasica`, que monta a clínica da demonstração, ambos em `tests/support/cenarios.ts`.

Cenários não são fixtures globais. Um cenário cria seus dados dentro do teste que o usa.

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

- Compare instantes como `Date` com `toEqual` ou `getTime()`. Não compare strings.
- Ao verificar um horário de negócio, use `toBusinessIso` de `src/shared/business-time.ts`, que formata o instante em `America/Sao_Paulo`. Assim o teste não passa só porque a máquina estava no mesmo fuso.
- Use `toBe` para instantes exatos e comparações de `getTime()` para intervalos.

## Sementes aleatórias

Não use dados aleatórios em testes. Se um cenário precisar de volume, gere os valores com um índice determinístico (`` `contato_${i}` ``). Assim, uma falha sempre reproduz.

## Limpeza entre execuções

| Situação | Estratégia |
|---|---|
| Teste de repositório ou serviço (uma conexão) | Transação com `ROLLBACK`, ou `TRUNCATE` em `afterEach`. |
| Teste de concorrência | `TRUNCATE` das tabelas tocadas em `beforeEach`, com conexões independentes. |
| Teste de migration | Banco novo, sem reaproveitamento de dados entre suítes. |

## O que não fazer

- Não chamar `new Date()`, `Date.now()` ou `performance.now()` dentro de um teste ou da aplicação. O tempo vem do `Clock` injetado.
- Não depender da ordem de execução dos testes.
- Não compartilhar um `Clock`, uma lista ou um objeto mutável entre testes.
- Não usar `setTimeout` para esperar efeitos. Use promessas explícitas, como `Promise.all`, e barreiras que liberam as operações juntas.
- Não criar dados de demonstração dentro dos testes. Os seeds são responsabilidade da documentação de seeds.
