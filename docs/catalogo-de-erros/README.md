# Catálogo de erros — Kenko API

Lista todos os códigos de erro que a API retorna, com o status HTTP, a condição que os provoca e o que o cliente deve fazer. O frontend usa o campo `code` para decidir o comportamento. A `message` é texto para exibição, pode mudar e não deve ser comparada em código.

Documentos relacionados:

- [README da API](../especificacao/kenko-backend-api.md): contratos e exemplos de resposta
- [Bot — interações e validação](../especificacao/kenko-bot-api.md#8-validações-estado-antigo-e-repetição)
- [Estratégia de testes](../estrategia-de-testes/criterios.md): casos que verificam cada código
- [ADR-0006](../adr/0006-idempotencia-e-revisao.md): origem dos códigos de revisão e idempotência

## Envelope

Todo erro tem o mesmo formato:

```json
{
  "error": {
    "code": "INVALID_PERIOD",
    "message": "Para period=month, reference deve usar YYYY-MM.",
    "fields": {
      "reference": "Formato inválido."
    }
  }
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `code` | sim | Identificador estável, em `UPPER_SNAKE_CASE`. Não muda entre versões. |
| `message` | sim | Descrição em português para exibição ou log. |
| `fields` | não | Presente só em erros de validação de parâmetros ou corpo. Mapa de campo para motivo. |

Erros de domínio que se referem a um campo específico também podem trazer `fields`, por exemplo `INVALID_OPTION`.

## Regras gerais

- O status HTTP indica a classe do problema. O `code` indica o motivo exato.
- Um mesmo status pode ter códigos diferentes. Por isso o cliente sempre lê `code`.
- Nenhum erro expõe stack trace, SQL, nome de tabela ou detalhe interno do banco.
- Erros de servidor não inventam códigos: retornam `INTERNAL_ERROR` genérico, com o detalhe apenas no log.

## Códigos por status HTTP

### 400 — Requisição malformada

| Código | Condição | Campos | Ação do cliente |
|---|---|---|---|
| `INVALID_JSON` | Corpo não é JSON válido ou não corresponde ao esquema. | nenhum | Corrigir a requisição. Não repetir sem alterar. |
| `MISSING_PARAMETER` | Parâmetro obrigatório ausente (`month`, `startDate`, `endDateExclusive`, `period`, `reference`, `ids`). | `{nome}: "Obrigatório."` | Informar o parâmetro. |
| `INVALID_DATE` | Data fora do formato `YYYY-MM-DD` ou data inexistente (ex.: 2026-02-30). | `{campo}: "Formato inválido."` | Corrigir o formato. |
| `INVALID_MONTH` | `month` fora do formato `YYYY-MM` ou mês inválido. | `{campo}: "Formato inválido."` | Corrigir o formato. |
| `INVALID_DATE_RANGE` | `endDateExclusive` não é posterior a `startDate`. | `endDateExclusive: "Deve ser posterior a startDate."` | Corrigir o intervalo. |
| `INVALID_PERIOD` | `period` fora de `week`, `month`, `year`, ou `reference` incompatível com o período. | `{campo}: "..."` | Corrigir o período ou a referência. |
| `FUTURE_PERIOD` | Referência de período posterior ao dia (`week`), ao mês (`month`) ou ao ano (`year`) atual, em Analytics. | `reference: "Período futuro não permitido."` | Escolher um período já iniciado. |
| `INVALID_IDS` | `ids` com mais de 50 itens, vazio ou com formato inválido. | `ids: "..."` | Dividir a lista ou corrigir o formato. |
| `INVALID_NAME` | Nome do paciente vazio ou acima do limite de caracteres. | `patient.name: "..."` | Solicitar o nome novamente. |
| `INVALID_BIRTH_DATE` | Data de nascimento futura ou inexistente. | `patient.birthDate: "..."` | Solicitar a data novamente. |
| `INVALID_INPUT_TYPE` | `input.type` desconhecido ou campos do tipo ausentes. | `input: "..."` | Corrigir a requisição. |

### 404 — Recurso inexistente

| Código | Condição | Campos | Ação do cliente |
|---|---|---|---|
| `CONVERSATION_NOT_FOUND` | ID de conversa inexistente. | nenhum | Iniciar nova conversa. |
| `APPOINTMENT_NOT_FOUND` | `appointmentId` inexistente **ou** pertencente a outra conversa. | nenhum | Recarregar a lista de reservas da conversa. |
| `CLINIC_NOT_FOUND` | Clínica ausente no banco. | nenhum | Erro de configuração; não é esperado em demonstração carregada. |

Reserva de outra conversa retorna 404, e não 403, para não revelar que ela existe (VAL-08).

### 409 — Conflito de estado

| Código | Condição | Campos | Ação do cliente |
|---|---|---|---|
| `STALE_CONVERSATION_STATE` | `expectedRevision` diferente da revisão atual. | nenhum | Consultar `GET /api/conversations/{id}` e reexibir o estado. |
| `ACTION_ID_CONFLICT` | Mesmo `actionId` com conteúdo diferente do original. | nenhum | Gerar um novo `actionId` para a nova ação. |
| `CONVERSATION_CLOSED` | Conversa encerrada por Sair. | nenhum | Iniciar nova conversa. |
| `CONVERSATION_ABANDONED` | Última interação há mais de uma hora. | nenhum | Iniciar nova conversa. |
| `SLOT_UNAVAILABLE` | Horário reservado por outro atendimento no momento da confirmação ou seleção. A resposta traz `view` com novas opções. | nenhum | Exibir o conflito e oferecer as opções retornadas. |
| `APPOINTMENT_NOT_CANCELLABLE` | Reserva completa ou já cancelada. | nenhum | Não repetir; exibir o status atual da reserva. |

`SLOT_UNAVAILABLE` é o único erro 409 que traz `view` na resposta. Os demais não trazem.

### 422 — Entrada válida no formato, inválida para o estado

| Código | Condição | Campos | Ação do cliente |
|---|---|---|---|
| `INVALID_OPTION` | `optionId` não pertence ao passo atual. | `optionId: "Opção indisponível neste passo."` | Reexibir as opções atuais. |
| `INVALID_SLOT` | `slotId` não foi oferecido na tentativa atual. | `slotId: "Horário não oferecido nesta tentativa."` | Reexibir os horários da tentativa. |
| `ACTION_NOT_ALLOWED_IN_STEP` | Tipo de entrada não aceito no passo atual (ex.: `submit_patient` na triagem). | `input.type: "..."` | Reexibir a view atual. |

## Erros de servidor

| Código | HTTP | Condição | Ação do cliente |
|---|---|---|---|
| `INTERNAL_ERROR` | 500 | Falha não tratada. Detalhe apenas no log. | Exibir mensagem genérica e permitir nova tentativa. |
| `SERVICE_UNAVAILABLE` | 503 | Banco indisponível. | Exibir indisponibilidade e tentar novamente depois. |

Um erro de servidor não deve deixar a conversa em estado parcial: a transação é desfeita, e o cliente pode repetir a mesma `actionId` com segurança (ADR-0006).

## Mapa de decisão para o frontend

| Se o código for… | O frontend deve… |
|---|---|
| `STALE_CONVERSATION_STATE` | Buscar o estado atual e reexibir. Não reenviar a ação antiga. |
| `SLOT_UNAVAILABLE` | Mostrar o aviso e usar a `view` recebida. |
| `CONVERSATION_ABANDONED` ou `CONVERSATION_CLOSED` | Oferecer "Nova conversa". Não tentar continuar. |
| `INVALID_*` (400 e 422) | Mostrar o erro no campo indicado em `fields`. |
| `*_NOT_FOUND` | Remover a referência local e atualizar a lista. |
| `INTERNAL_ERROR` ou `SERVICE_UNAVAILABLE` | Mostrar mensagem genérica e permitir reenvio com a mesma `actionId`. |

## Pendências

| # | Pendência | Proposta |
|---|---|---|
| P1 | `APPOINTMENT_NOT_IN_CONVERSATION` aparece em discussões, mas não está nos documentos aprovados. | **Decidido:** removido. A reserva de outra conversa responde `APPOINTMENT_NOT_FOUND` (404), conforme VAL-08. |
| P2 | `CONVERSATION_CLOSED` e `CONVERSATION_ABANDONED` não aparecem no README da API, que cita apenas o segundo. | **Decidido:** `CONVERSATION_CLOSED` acrescentado ao README da API. |
| P3 | `INVALID_DATE_RANGE` e `FUTURE_PERIOD` não estão no README da API. | **Decidido:** acrescentados ao README da API. |
| P4 | Ordem de precedência quando uma requisição tem mais de um erro (ex.: `actionId` repetido e revisão antiga). | Regra do ADR-0006: verificar idempotência antes de revisão. Confirmar que o catálogo segue a mesma ordem. |
| P5 | `PATIENT_ALREADY_IDENTIFIED` pode nunca ocorrer, se o fluxo impede o reenvio. | **Decidido:** removido. Reenvio com o mesmo `actionId` devolve o resultado salvo (ADR-0006). |

Os códigos de P1 e P5 foram removidos do catálogo. Se o frontend já referencia algum deles, ele deve tratá-los como `INTERNAL_ERROR`.
