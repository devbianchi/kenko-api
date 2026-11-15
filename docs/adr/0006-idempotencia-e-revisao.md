# ADR-0006: Idempotência por `actionId` e controle de revisão

**Status:** Aceita
**Data:** 2026-11-14

## Contexto

O cliente pode reenviar uma ação após falha de rede, e duas ações diferentes podem ser disparadas a partir da mesma tela. O sistema precisa:

- não duplicar reserva, busca ou avanço de passo quando a mesma ação chega duas vezes;
- rejeitar uma ação baseada em estado que já mudou;
- tratar corretamente duas requisições concorrentes com a mesma chave.

Os dois mecanismos resolvem problemas diferentes. Revisão controla conflito entre ações diferentes. Idempotência controla repetição da mesma ação.

## Decisão

**Revisão:** a tabela `conversa` tem a coluna `revisao`. A transição de estado é feita com atualização condicional dentro da transação:

```sql
UPDATE conversa SET revisao = revisao + 1
WHERE id_conversa = ? AND revisao = ?;
```

Se nenhuma linha for afetada, a resposta é 409 `STALE_CONVERSATION_STATE`.

**Idempotência:** tabela `acao_processada`, com unicidade em `(id_conversa, action_id)`. Ela guarda:

- o hash do input recebido;
- o resultado estruturado (JSONB), para devolver na repetição.

Regras de decisão ao receber uma ação:

1. Se existe registro com o mesmo `actionId` e o mesmo hash, devolve o resultado salvo, sem executar novamente.
2. Se existe registro com o mesmo `actionId` e hash diferente, responde 409 (conflito).
3. Se não existe, executa a ação e grava o registro na mesma transação.

Duas requisições concorrentes com a mesma chave: uma grava, a outra falha na violação de unicidade. Quem falhou relê o registro e devolve o resultado salvo.

A verificação de ação já processada acontece antes da verificação de revisão, porque um reenvio legítimo traz a revisão original, que já não é a atual.

## Consequências

- Cada ação gera uma linha extra. O volume é pequeno para a demonstração.
- O reenvio não produz efeito colateral, mesmo após o estado ter avançado.
- A lógica fica concentrada em um único ponto do serviço de interações.
- Abandono não entra nessa decisão: ele é calculado a partir da última interação e não usa a revisão.

## Alternativas consideradas

- **Somente revisão:** um reenvio com revisão antiga seria rejeitado como conflito, em vez de devolver o resultado já processado. Descartado.
- **Somente `actionId`:** não protege contra ações diferentes disparadas sobre o mesmo estado. Descartado.
- **Lock pessimista na conversa (`SELECT ... FOR UPDATE`):** serializa as ações da conversa, mas não resolve o reenvio com o mesmo `actionId`. Pode ser usado junto, se necessário, como reforço. Não substitui a decisão acima.