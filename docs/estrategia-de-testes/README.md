# Estratégia de testes — Kenko API

Define o que é testado em cada nível, com quais ferramentas, quais casos são obrigatórios e como a suíte é executada.

Documentos relacionados:

- [Matriz de critérios](criterios.md): cada VAL-xx do escopo mapeado para o nível de teste
- [Dados de teste](dados-de-teste.md): fixtures, relógio fixo e cenários
- [ADR-0003](../adr/0003-testcontainers.md): decisão de usar Testcontainers com PostgreSQL
- [ADR-0005](../adr/0005-clock-por-requisicao.md): relógio injetado
- [Guia de desenvolvimento local](../desenvolvimento-local/README.md): comandos

## Princípios

1. **Cada regra é testada no nível mais baixo que a prova.** Regra de status não precisa de banco. Índice único parcial precisa.
2. **Garantias de banco são provadas no banco.** Dupla reserva, idempotência em corrida e revisão condicional só são verificadas com PostgreSQL real.
3. **Tempo é controlado.** Nenhum teste depende do relógio real. Todos usam `Clock` fixo (ADR-0005).
4. **Teste precisa poder falhar.** Cada teste de proteção tem um caso de controle positivo e verifica o estado após a rejeição.
5. **Sem dependência entre testes.** Cada teste prepara e limpa seus próprios dados.

## Níveis

| Nível | O que cobre | Banco | Ferramentas | Execução típica |
|---|---|---|---|---|
| Unitário | Regras puras: status, mediana, P90, histograma, semana domingo–sábado, validação de entrada, classificação de expediente | Não | Vitest (`expect`) | Segundos |
| Integração de repositório | SQL das queries, constraints, índices parciais, transações | PostgreSQL via Testcontainers | Vitest, `pg` | Dezenas de segundos |
| Integração de serviço | Fluxo completo de uma ação: revisão, idempotência, confirmação transacional | PostgreSQL via Testcontainers | Vitest, `pg` | Dezenas de segundos |
| Concorrência | Duas conversas disputando o mesmo horário; mesma `actionId` em paralelo | PostgreSQL via Testcontainers | `Promise.all` com conexões independentes do pool | Segundos |
| HTTP (contrato) | Status codes, envelope de erro, formato JSON, validação de parâmetros | Opcional (pode usar serviço simulado) | supertest sobre `buildApp` | Segundos |
| Migrations | Aplicação do zero, ordem, `schema_migrations` com todas as versões | PostgreSQL via Testcontainers | `migrate()` de `src/database/migrate.ts` | Dezenas de segundos |

Ponto de atenção: testes de HTTP que dependem do banco entram na integração. Os que usam serviço simulado ficam no nível HTTP. As duas abordagens não devem ser misturadas na mesma classe.

## Ferramentas

| Ferramenta | Papel |
|---|---|
| Vitest | Runner, asserções (`expect`) e simulações (`vi.fn`). Cobertura com `@vitest/coverage-v8`. |
| supertest | Testes de contrato HTTP sobre a aplicação montada por `buildApp`, sem subir servidor. |
| `@testcontainers/postgresql` | Banco real descartável por execução. Ver `tests/support/postgres.ts`. |
| `migrate()` | Aplicação das migrations nos testes, igual ao ambiente real. |

Não usar banco em memória, MSW, ferramentas de E2E nem bibliotecas de property-based testing nesta etapa. A introdução de outra ferramenta exige atualizar este documento e o ADR correspondente.

## Organização

Os testes ficam em `tests/`, separados por nível:

```
tests/
  unit/                  regras puras, sem banco; *.test.ts
  integration/           PostgreSQL real; *.it.test.ts
  support/               base com PostgreSQL e helpers de cenário
```

Quando uma feature tiver regras próprias, o teste unitário fica em `tests/unit/` com o nome da feature (por exemplo `tests/unit/calendar/`).

Convenções:

- Teste unitário: `nome-do-modulo.test.ts`, em `tests/unit/`.
- Teste de integração: `nome-do-modulo.it.test.ts`, em `tests/integration/`.
- Teste de concorrência: `nome-do-modulo.concurrency.it.test.ts`, em `tests/integration/`.
- Nome do teste descreve o comportamento, no padrão `acao_resultado_quando_condicao`, por exemplo `rejeita_segunda_reserva_do_mesmo_horario`.
- Uma regra por teste. Cenários com vários passos usam `describe` aninhado para agrupar.

## Obrigatórios

Estes casos precisam existir antes de a funcionalidade ser considerada pronta:

**Reserva e concorrência**
- Duas conversas tentam o mesmo horário ao mesmo tempo: uma confirma, a outra recebe 409 `SLOT_UNAVAILABLE`.
- Após cancelamento, o horário volta a ser reservável.
- Reserva cancelada não bloqueia nova reserva; reserva ativa bloqueia.

**Idempotência e revisão**
- Mesma `actionId` e mesmo conteúdo: devolve o resultado salvo, sem nova reserva, busca ou avanço.
- Mesma `actionId` com conteúdo diferente: 409.
- Mesma `actionId` em paralelo: uma execução, sem violação não tratada.
- Revisão antiga com ação nova: 409 `STALE_CONVERSATION_STATE`, sem alterar o estado.
- Reenvio legítimo após o estado ter avançado: devolve o resultado original, não 409.

**Abandono e tempo**
- Conversa com última interação exatamente uma hora atrás: ativa.
- Um minuto e um segundo depois: abandonada, com ação rejeitada.
- GET não renova a última interação.
- Abandono não é gravado: a coluna da conversa não muda após a leitura.

**Cálculos de métricas**
- Mediana com número ímpar e par de amostras.
- P90 com dez amostras retorna a nona menor duração.
- Histograma: duração de exatamente dez minutos cai em "10+".
- Divisão por zero retorna `null`, nunca `NaN` ou zero artificial.
- Confirmação em mês seguinte permanece no grupo de início da conversa.

**Segurança de vínculo**
- Cancelamento de consulta completa é recusado e o horário não é liberado.
- Reserva de outra conversa não aparece nem pode ser cancelada, mesmo com mesmo nome de paciente.
- Paciente de uma conversa nunca é reaproveitado em outra.

**Migrations**
- Aplicação do zero sem erro.
- `schema_migrations` com todas as versões do diretório, sem falhas.
- Constraints de `UNIQUE` e `CHECK` impedem dados inválidos (teste por caso de violação).

## Cobertura

Não há percentual mínimo nesta etapa. A cobertura é medida com `@vitest/coverage-v8` e serve para localizar código sem teste, não como critério de aceite. Um método sem teste das regras acima é motivo de revisão, mesmo com cobertura alta.

## Comandos

| Tarefa | Comando |
|---|---|
| Todos os testes | `npm test` |
| Só unitários | `npm run test:unit` |
| Só integração | `npm run test:integration` |
| Um arquivo | `npx vitest run tests/integration/api.it.test.ts` |
| Concorrência | `npx vitest run tests/integration/*.concurrency.it.test.ts` |
| Cobertura | `npm run test:coverage` (relatório em `coverage/`) |

A separação entre unitário e integração é feita pelo diretório (`tests/unit` e `tests/integration`), e não por tags.

## Critérios de pronto por tarefa

Uma funcionalidade só é considerada pronta quando:

1. Cada regra afetada tem teste no nível indicado em [criterios.md](criterios.md).
2. Os testes de proteção foram verificados com mutação: o teste falha se a regra for removida.
3. A suíte completa passa em uma execução limpa (`npm run typecheck && npm run lint && npm test`).
4. Não há teste ignorado (`it.skip` ou `describe.skip`) sem justificativa registrada no próprio arquivo.
5. Nenhum teste depende do relógio real, de ordem de execução ou de dados deixados por outro teste.

## Verificação de mutação

Para cada teste de proteção, a equipe altera manualmente a regra no código, roda o teste e confirma que ele falha. Depois, desfaz a alteração. A verificação é manual nesta etapa; uma ferramenta automática de mutação (por exemplo, Stryker) pode ser avaliada depois.

## Não cobertos aqui

- Testes de tela e de interface: pertencem ao frontend, conforme o contexto de UI.
- Testes de carga e desempenho: fora do escopo acadêmico.
- Testes de segurança de aplicação (autenticação, injeção): a API é aberta por definição, e a proteção de vínculo é coberta acima.