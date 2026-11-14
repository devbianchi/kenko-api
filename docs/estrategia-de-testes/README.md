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
| Unitário | Regras puras: status, mediana, P90, histograma, semana domingo–sábado, validação de entrada, classificação de expediente | Não | JUnit 5, AssertJ | Segundos |
| Integração de repositório | SQL das queries, constraints, índices parciais, transações | PostgreSQL via Testcontainers | Spring Boot Test, JdbcClient | Dezenas de segundos |
| Integração de serviço | Fluxo completo de uma ação: revisão, idempotência, confirmação transacional | PostgreSQL via Testcontainers | Spring Boot Test | Dezenas de segundos |
| Concorrência | Duas conversas disputando o mesmo horário; mesma `actionId` em paralelo | PostgreSQL via Testcontainers | Threads ou `ExecutorService`, latch de início | Segundos |
| HTTP (contrato) | Status codes, envelope de erro, formato JSON, validação de parâmetros | Opcional (pode usar serviço simulado) | Spring MockMvc | Segundos |
| Migrations | Aplicação do zero, ordem, `flyway_schema_history` sem falhas | PostgreSQL via Testcontainers | Flyway + Spring Boot Test | Dezenas de segundos |

Ponto de atenção: testes de HTTP que dependem do banco entram na integração. Os que usam serviço simulado ficam no nível HTTP. As duas abordagens não devem ser misturadas na mesma classe.

## Ferramentas

| Ferramenta | Papel |
|---|---|
| JUnit 5 | Runner e anotações. Vem com `spring-boot-starter-test`. |
| AssertJ | Asserções legíveis. Vem com `spring-boot-starter-test`. |
| Mockito | Simulação de dependências em testes unitários de serviço. Vem com `spring-boot-starter-test`. |
| Spring Boot Test | Contexto da aplicação em testes de integração. |
| MockMvc | Testes de contrato HTTP sem subir servidor. |
| Testcontainers (PostgreSQL) | Banco real descartável por execução. |
| Flyway | Aplicação das migrations nos testes, igual ao ambiente real. |

Não usar H2, MSW, ferramentas de E2E nem bibliotecas de property-based testing nesta etapa. A introdução de outra ferramenta exige atualizar este documento e o ADR correspondente.

## Organização

Pacote de teste espelha o de produção, dentro de `src/test/java/com/kenko/kenko_api/`:

```
src/test/java/com/kenko/kenko_api/
  shared/                       Clock fixo, utilitários de teste compartilhados
  support/                     Base de integração com PostgreSQL e helpers de cenário
  calendar/
  dashboard/
  analytics/
  conversation/
  scheduling/
```

Convenções:

- Teste unitário: `NomeDaClasseTest`.
- Teste de integração: `NomeDaClasseIT`, executado pela mesma suíte, separado por tag `integration`.
- Teste de concorrência: `NomeDaClasseConcorrenciaIT`.
- Nome do método descreve o comportamento: `rejeita_segunda_reserva_do_mesmo_horario`, no padrão `acao_resultado_quando_condicao`.
- Uma regra por teste. Cenários com vários passos usam `@Nested` para agrupar.

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
- Todas as linhas de `flyway_schema_history` com `success = true`.
- Constraints de `UNIQUE` e `CHECK` impedem dados inválidos (teste por caso de violação).

## Cobertura

Não há percentual mínimo nesta etapa. A cobertura é medida com JaCoCo e serve para localizar código sem teste, não como critério de aceite. Um método sem teste das regras acima é motivo de revisão, mesmo com cobertura alta.

## Comandos

| Tarefa | Comando |
|---|---|
| Todos os testes | `./mvnw test` |
| Só unitários | `./mvnw test -Dgroups=unit` |
| Só integração | `./mvnw test -Dgroups=integration` |
| Uma classe | `./mvnw test -Dtest=ConversaInteracaoServiceIT` |
| Concorrência | `./mvnw test -Dtest=*ConcorrenciaIT` |
| Cobertura | `./mvnw verify` (gera relatório JaCoCo em `target/site/jacoco`) |

As tags `unit` e `integration` são definidas com `@Tag` do JUnit 5. A configuração de Surefire precisa ler `groups`, o que entra na Fase 1.

## Critérios de pronto por tarefa

Uma funcionalidade só é considerada pronta quando:

1. Cada regra afetada tem teste no nível indicado em [criterios.md](criterios.md).
2. Os testes de proteção foram verificados com mutação: o teste falha se a regra for removida.
3. A suíte completa passa em uma execução limpa (`./mvnw clean verify`).
4. Não há teste ignorado (`@Disabled`) sem justificativa registrada no próprio arquivo.
5. Nenhum teste depende do relógio real, de ordem de execução ou de dados deixados por outro teste.

## Verificação de mutação

Para cada teste de proteção, a equipe altera manualmente a regra no código, roda o teste e confirma que ele falha. Depois, desfaz a alteração. A verificação é manual nesta etapa; uma ferramenta automática de mutação (PIT) pode ser avaliada depois.

## Não cobertos aqui

- Testes de tela e de interface: pertencem ao frontend, conforme o contexto de UI.
- Testes de carga e desempenho: fora do escopo acadêmico.
- Testes de segurança de aplicação (autenticação, injeção): a API é aberta por definição, e a proteção de vínculo é coberta acima.