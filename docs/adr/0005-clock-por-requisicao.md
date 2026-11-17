# ADR-0005: Instante de avaliação único por requisição

**Status:** Parcialmente substituída por ADR-0010
**Data:** 2026-11-14

## Contexto

Vários cálculos dependem do instante atual: status completa ou pendente, abandono após uma hora, próximas consultas, `evaluatedAt`. Se cada trecho chamar `Instant.now()` ou `LocalDateTime.now()`, a mesma resposta pode usar instantes diferentes, e os testes não conseguem controlar o tempo.

O escopo também exige que datas e comparações usem `America/Sao_Paulo`, independentemente do fuso do servidor.

## Decisão

- Declarar um bean `Clock` em `shared`, com zona `America/Sao_Paulo`.
- Cada requisição captura o instante uma única vez, no ponto de entrada (controller ou serviço de nível superior), e o passa como parâmetro aos demais componentes.
- Proibido chamar `Instant.now()`, `LocalDate.now()` ou `System.currentTimeMillis()` fora do bean `Clock`.
- Testes injetam um `Clock` fixo.

## Consequências

- Todos os cálculos de uma resposta são coerentes entre si.
- Abandono, status e próximas consultas podem ser testados com datas controladas.
- Não há parâmetro público para simular o passado. Isso é intencional.
- Os seeds envelhecem com o relógio real. Esse efeito é esperado e está descrito no escopo.

## Alternativas consideradas

- **Chamadas diretas a `now()` nos pontos de uso:** rápido de escrever, mas produz inconsistência dentro de uma mesma resposta e impede testes determinísticos. Descartado.
- **Parâmetro de data na API para simulação:** aumenta a superfície do contrato sem necessidade para a demonstração. Descartado.