# Kenko API

API REST do sistema de atendimento e agendamento da clínica Kenko. Ela atende o painel (Home, Calendário, Dia e Analytics) e o bot de agendamento do Showcase. Este README documenta os endpoints. As regras de negócio completas estão em `docs/escopo/escopo-kenko-v2.md`, e os detalhes do bot em `docs/especificacao/kenko-bot-api.md`.

> **Status:** contrato de referência. A implementação está em andamento e este documento descreve o comportamento esperado.

## Sumário

- [Visão geral](#visão-geral)
- [Convenções](#convenções)
- [Erros](#erros)
- [Endpoints](#endpoints)
  - [Clínica](#clínica)
  - [Home](#home)
  - [Calendário](#calendário)
  - [Dia](#dia)
  - [Analytics](#analytics)
  - [Conversas](#conversas)
  - [Reservas da conversa](#reservas-da-conversa)
- [Interações do bot](#interações-do-bot)
- [Regras que afetam as respostas](#regras-que-afetam-as-respostas)
- [Fora do escopo](#fora-do-escopo)
- [Documentação complementar](#documentação-complementar)

## Visão geral

| Item | Valor |
|---|---|
| Base URL | `/api` |
| Formato | JSON (`Content-Type: application/json`) |
| Autenticação | Nenhuma. A demonstração é aberta. |
| Fuso de negócio | `America/Sao_Paulo` |
| Comunicação | HTTP requisição/resposta. Sem WebSocket ou streaming. |

## Convenções

**Nomes e tipos**

- Campos em `camelCase`.
- Identificadores são opacos (`cv_1`, `slot_501`). O cliente não deve depender do formato. Na API, o prefixo indica o tipo e o número é a chave interna da tabela (`cv_1` = `id_conversa` 1; `slot_501` = `id_horario` 501).
- Datas: `YYYY-MM-DD`. Meses: `YYYY-MM`. Instantes: ISO 8601 com deslocamento (`2026-11-11T09:00:00-03:00`).
- Durações: números inteiros em segundos.
- Percentuais: escala 0–100.

**Ausência de dados**

| Situação | Valor |
|---|---|
| Sem base para calcular (ex.: mediana sem amostras, ranking sem registros) | `null` |
| Contagem sem ocorrências | `0` |
| Coleção vazia | `[]` |

O frontend exibe `null` como “—”. Não envie esse símbolo em campos numéricos.

**Envelope de resposta**

Leituras retornam `data`. Quando a resposta depende do relógio, `meta` traz o contexto:

```json
{
  "meta": {
    "timezone": "America/Sao_Paulo",
    "evaluatedAt": "2026-11-10T12:15:00-03:00"
  },
  "data": {}
}
```

`evaluatedAt` é capturado uma vez por requisição e usado em todos os cálculos dela. Não há parâmetro para simular outro instante.

**Intervalos temporais**

Intervalos incluem o início e excluem o fim: `instante >= inicio AND instante < fim`.

## Erros

Todo erro segue este formato:

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

| HTTP | Quando ocorre |
|---|---|
| 200 | Leitura ou interação processada. Coleção vazia também é 200. |
| 201 | Conversa criada. |
| 400 | JSON, parâmetro, formato de data ou intervalo malformado. |
| 404 | Recurso inexistente, ou reserva que não pertence à conversa informada. |
| 409 | Conflito de estado: revisão antiga, horário ocupado, conversa encerrada ou abandonada, reserva não cancelável. |
| 422 | Entrada compreensível, mas inválida para o passo atual: opção incompatível, nome vazio, nascimento futuro. |

**Códigos de erro previstos**

| Código | HTTP | Significado |
|---|---|---|
| `INVALID_PERIOD` | 400 | `period` ou `reference` malformado para o tipo de período. |
| `INVALID_DATE_RANGE` | 400 | `endDateExclusive` não é posterior a `startDate`. |
| `FUTURE_PERIOD` | 400 | Referência posterior ao dia (`week`), ao mês (`month`) ou ao ano (`year`) atual. |
| `STALE_CONVERSATION_STATE` | 409 | `expectedRevision` diferente do estado atual. Consulte `GET /api/conversations/{id}`. |
| `CONVERSATION_ABANDONED` | 409 | Conversa sem atividade há mais de uma hora. Inicie outra conversa. |
| `CONVERSATION_CLOSED` | 409 | Conversa encerrada pelo paciente com Sair. Inicie outra conversa. |
| `SLOT_UNAVAILABLE` | 409 | O horário foi reservado por outro atendimento. Novas opções são retornadas. |
| `INVALID_OPTION` | 422 | Opção não pertence ao passo atual. |

Uma tabela completa de códigos será mantida junto ao código.

## Endpoints

### Clínica

#### `GET /api/clinic`

Retorna dados da clínica, expediente e especialidades. Usado no menu de informações do bot e na identificação da clínica no painel.

Sem parâmetros.

**Resposta 200**

```json
{
  "data": {
    "id": "clinic_1",
    "name": "Clínica Demonstração",
    "address": "Rua de Exemplo, 100",
    "phone": "1100000000",
    "openingHours": [
      {"weekdays": [1, 2, 3, 4, 5], "opensAt": "07:00", "closesAt": "18:00"},
      {"weekdays": [6], "opensAt": "09:00", "closesAt": "13:00"},
      {"weekdays": [0], "closed": true}
    ],
    "specialties": [
      {"id": "sp_1", "name": "Clínico geral"},
      {"id": "sp_2", "name": "Dermatologia"}
    ]
  }
}
```

**Regra de `openingHours`:** dias consecutivos na ordem da semana, de segunda a domingo, com o mesmo horário viram um único item. Os itens seguem a mesma ordem, com domingo por último. Horários diferentes geram itens separados. Dia fechado vira `{"weekdays": [...], "closed": true}`.

Dias da semana: `0` é domingo, `1` segunda, até `6` sábado. Abertura incluída, fechamento excluído.

### Home

#### `GET /api/dashboard`

Retorna os indicadores mensais e as próximas consultas.

| Parâmetro | Obrigatório | Formato | Descrição |
|---|---|---|---|
| `month` | sim | `YYYY-MM` | Mês de referência dos indicadores mensais. |

```http
GET /api/dashboard?month=2026-11
```

**Resposta 200**

```json
{
  "meta": {
    "timezone": "America/Sao_Paulo",
    "evaluatedAt": "2026-11-10T12:15:00-03:00"
  },
  "data": {
    "clinic": {"id": "clinic_1", "name": "Clínica Demonstração"},
    "appointments": {"total": 22, "complete": 10, "pending": 8, "cancelled": 4},
    "bestDay": {"date": "2026-11-10", "appointmentCount": 4},
    "peakHour": {
      "hour": 9,
      "appointmentCount": 6,
      "otherBusinessHoursAverage": 1.6,
      "aboveAverage": 4.4
    },
    "bestRoom": {"id": "room_1", "name": "Sala 1", "appointmentCount": 12},
    "attendanceDuration": {
      "statistic": "median",
      "seconds": 150,
      "previousSeconds": 165,
      "differenceSeconds": -15
    },
    "upcomingAppointments": [
      {
        "id": "ap_90",
        "status": "pending",
        "startsAt": "2026-11-10T13:00:00-03:00",
        "endsAt": "2026-11-10T13:30:00-03:00",
        "patient": {"id": "pt_20", "name": "Ana"},
        "specialty": {"id": "sp_2", "name": "Dermatologia"},
        "doctor": {"id": "dr_2", "name": "Dra. Helena"},
        "room": {"id": "room_2", "name": "Sala 2"}
      }
    ]
  }
}
```

**Regras**

- `appointments` inclui canceladas nos totais.
- `bestDay`, `bestRoom` e `peakHour` podem ser `null` quando o mês não tem consultas.
- `attendanceDuration` é a **mediana** do tempo entre o início da conversa e a primeira confirmação. Não é média.
- `upcomingAppointments` tem até cinco consultas pendentes com início futuro, a partir do relógio atual. Não depende do mês informado.

### Calendário

#### `GET /api/calendar`

Retorna a contagem de consultas por data, dentro do intervalo que o frontend está exibindo.

| Parâmetro | Obrigatório | Formato | Descrição |
|---|---|---|---|
| `startDate` | sim | `YYYY-MM-DD` | Primeiro dia incluído. |
| `endDateExclusive` | sim | `YYYY-MM-DD` | Primeiro dia **não** incluído. Deve ser posterior a `startDate`. |

```http
GET /api/calendar?startDate=2026-09-27&endDateExclusive=2026-11-01
```

O frontend monta a grade (incluindo dias de meses vizinhos) e envia o intervalo visível. A API não decide quantas linhas a grade tem.

**Resposta 200**

```json
{
  "meta": {
    "timezone": "America/Sao_Paulo",
    "evaluatedAt": "2026-11-10T12:15:00-03:00"
  },
  "data": {
    "today": "2026-11-10",
    "countsByDate": {
      "2026-09-30": 2,
      "2026-10-01": 3,
      "2026-10-27": 4
    }
  }
}
```

Datas ausentes de `countsByDate` têm zero consultas. Canceladas entram na contagem.

### Dia

#### `GET /api/calendar/days/{date}`

Detalha uma data: totais por status, distribuição por hora, resumo manhã/tarde e ocupação por sala.

| Parâmetro | Obrigatório | Formato | Descrição |
|---|---|---|---|
| `date` (path) | sim | `YYYY-MM-DD` | Data a detalhar. |

```http
GET /api/calendar/days/2026-11-10
```

**Resposta 200**

```json
{
  "meta": {
    "timezone": "America/Sao_Paulo",
    "evaluatedAt": "2026-11-10T12:15:00-03:00"
  },
  "data": {
    "date": "2026-11-10",
    "summary": {
      "total": 4,
      "complete": 2,
      "pending": 1,
      "cancelled": 1,
      "completionPercentage": 50
    },
    "appointmentsByHour": {
      "hours": [0, 1, 2, "...", 23],
      "counts": [0, 0, 0, "...", 0]
    },
    "appointmentsByDayPeriod": {"morning": 3, "afternoon": 1},
    "rooms": [
      {
        "id": "room_1",
        "name": "Sala 1",
        "appointmentCount": 3,
        "cancelledCount": 1,
        "totalSlots": 4,
        "occupiedSlots": 2,
        "occupancyPercentage": 50,
        "peakHour": 9
      }
    ]
  }
}
```

**Regras**

- `total` = `complete` + `pending` + `cancelled` = soma das consultas por sala = valor do calendário para a mesma data.
- Manhã é antes de 12h; tarde é a partir de 12h.
- `occupancyPercentage` conta horários com reserva não cancelada sobre o total de horários da sala. Não é por minutos.
- Salas cadastradas aparecem mesmo sem consultas. Sem capacidade na data, a ocupação é `null`.

### Analytics

#### `GET /api/analytics`

Retorna os KPIs, o funil, os términos, o histograma de duração, o mapa de calor, a série de conclusão e as buscas sem horário por especialidade.

| Parâmetro | Obrigatório | Valores | Descrição |
|---|---|---|---|
| `period` | sim | `week`, `month`, `year` | Tipo de período. |
| `reference` | sim | conforme abaixo | Data ou mês de referência. |

| `period` | `reference` | Período resolvido |
|---|---|---|
| `week` | `YYYY-MM-DD` | Sete dias terminando na data informada. Data posterior a hoje retorna `FUTURE_PERIOD`. |
| `month` | `YYYY-MM` | Mês informado, em blocos de dias para a série. |
| `year` | `YYYY` | Ano corrente: janeiro até o mês atual. Anos anteriores: doze meses. Ano futuro não é permitido. |

```http
GET /api/analytics?period=month&reference=2026-10
```

**Resposta 200 (resumo da estrutura)**

```json
{
  "meta": {
    "timezone": "America/Sao_Paulo",
    "evaluatedAt": "2026-11-10T12:15:00-03:00",
    "period": {
      "type": "month",
      "reference": "2026-10",
      "start": "2026-10-01T00:00:00-03:00",
      "endExclusive": "2026-11-01T00:00:00-03:00"
    },
    "previousPeriod": {
      "start": "2026-08-31T00:00:00-03:00",
      "endExclusive": "2026-10-01T00:00:00-03:00"
    }
  },
  "data": {
    "kpis": {
      "botCompletion": {
        "percentage": 50,
        "confirmedConversations": 4,
        "schedulingConversations": 8,
        "previousValue": 40,
        "difference": 10,
        "differenceUnit": "percentage_points"
      },
      "attendanceDuration": {
        "statistic": "median",
        "seconds": 150,
        "sampleSize": 4,
        "previousValue": 180,
        "difference": -30,
        "differenceUnit": "seconds"
      },
      "outsideBusinessHours": {
        "percentage": 30,
        "outsideConversations": 3,
        "startedConversations": 10,
        "previousValue": null,
        "difference": null,
        "differenceUnit": "percentage_points"
      },
      "agendaOccupancy": {
        "percentage": 50,
        "occupiedSlots": 10,
        "totalSlots": 20,
        "previousValue": 45,
        "difference": 5,
        "differenceUnit": "percentage_points"
      },
      "searchesWithoutSlots": {
        "count": 3,
        "previousValue": 2,
        "difference": 1,
        "differenceUnit": "count"
      }
    },
    "funnel": [],
    "conversationEndings": [],
    "durationDistribution": {},
    "conversationHeatmap": {},
    "completionSeries": {},
    "searchesWithoutSlotsBySpecialty": []
  }
}
```

Os blocos `funnel`, `conversationEndings`, `durationDistribution`, `conversationHeatmap`, `completionSeries` e `searchesWithoutSlotsBySpecialty` seguem o formato completo do documento de backend.

**Regras**

- `botCompletion` conta conversas distintas: conversas que confirmaram pelo menos um agendamento dividido pelas que escolheram Agendar. Não passa de 100%.
- `attendanceDuration` e o histograma usam uma duração por conversa, até a primeira confirmação.
- Conversas são agrupadas pela data de início. Buscas sem horário usam o instante da busca. Consultas usam a data marcada.
- Diferenças só são calculadas quando as duas bases existem; caso contrário, `null`.
- A resposta não inclui pacientes individuais, transcrições, nem aceita SQL, agrupamentos ou filtros arbitrários.

### Conversas

#### `POST /api/conversations`

Cria uma conversa para um contato gerado no frontend. O bot envia automaticamente as boas-vindas e o menu.

```json
{"contactId": "contact_1"}
```

**Resposta 201**

```json
{
  "conversation": {
    "id": "cv_1",
    "effectiveStatus": "active",
    "revision": 0,
    "step": "menu",
    "attemptId": null
  },
  "messages": [
    {
      "id": "msg_1",
      "author": "bot",
      "text": "Olá! Sou o assistente Kenko. Como posso ajudar?",
      "sentAt": "2026-11-10T12:00:00-03:00"
    }
  ],
  "view": {
    "type": "options",
    "options": [
      {"id": "opt_schedule", "label": "Agendar uma consulta"},
      {"id": "opt_clinic_info", "label": "Ver informações da clínica"},
      {"id": "opt_appointments", "label": "Ver ou cancelar um agendamento"}
    ]
  },
  "availableActions": ["exit"]
}
```

**Regras**

- Repetir a criação com o mesmo `contactId` (por exemplo, após falha de rede) retorna a conversa existente, sem criar outra nem renovar a atividade. A resposta é 200, sem mensagens novas. A primeira criação responde 201.
- `contactId` é obrigatório, com 1 a 64 caracteres. Ausente retorna 400 `MISSING_PARAMETER`; inválido retorna 400 `INVALID_INPUT_TYPE`.
- Uma nova intenção de iniciar conversa usa um `contactId` novo.

#### `GET /api/conversations`

Retorna estado e última atividade de conversas conhecidas pelo navegador.

| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `ids` | sim | Lista separada por vírgula, até 50 IDs. |

```http
GET /api/conversations?ids=cv_1,cv_2
```

**Resposta 200**

```json
{
  "meta": {
    "timezone": "America/Sao_Paulo",
    "evaluatedAt": "2026-11-10T12:15:00-03:00"
  },
  "data": [
    {"id": "cv_1", "effectiveStatus": "active", "lastInteractionAt": "2026-11-10T12:01:00-03:00"},
    {"id": "cv_2", "effectiveStatus": "abandoned", "lastInteractionAt": "2026-11-10T09:00:00-03:00"}
  ]
}
```

- `ids` é obrigatório. Sem ele, a resposta é 400 `MISSING_PARAMETER`. Vazio, malformado ou com mais de 50 IDs retorna 400 `INVALID_IDS`.
- IDs inexistentes podem ser omitidos.
- Para mais de 50 IDs, divida a chamada.
- Não há listagem geral de conversas.

#### `GET /api/conversations/{id}`

Retorna o estado efetivo e a interface atual da conversa para reexibição. Não gera mensagens, não avança o fluxo, não executa busca de horários e não renova a atividade.

```json
{
  "conversation": {
    "id": "cv_1",
    "effectiveStatus": "active",
    "revision": 5,
    "step": "menu",
    "attemptId": null,
    "startedAt": "2026-11-10T12:00:00-03:00",
    "lastInteractionAt": "2026-11-10T12:01:00-03:00"
  },
  "view": {
    "type": "options",
    "options": [
      {"id": "opt_schedule", "label": "Agendar uma consulta"}
    ]
  },
  "availableActions": ["exit"]
}
```

`effectiveStatus` pode ser `active`, `closed` ou `abandoned`. Abandono é calculado no momento da leitura, não gravado.

#### `POST /api/conversations/{id}/interactions`

Ponto único de entrada das ações do paciente. Veja a seção [Interações do bot](#interações-do-bot).

### Reservas da conversa

#### `GET /api/conversations/{id}/appointments`

Lista todas as reservas originadas nesta conversa, inclusive completas e canceladas.

```http
GET /api/conversations/cv_1/appointments
```

**Resposta 200**

```json
{
  "meta": {
    "timezone": "America/Sao_Paulo",
    "evaluatedAt": "2026-11-10T12:15:00-03:00"
  },
  "data": [
    {
      "id": "ap_101",
      "status": "pending",
      "canCancel": true,
      "patient": {"id": "pt_1", "name": "Ana Silva"},
      "specialty": {"id": "sp_2", "name": "Dermatologia"},
      "doctor": {"id": "dr_2", "name": "Dra. Helena"},
      "room": {"id": "room_1", "name": "Sala 1"},
      "startsAt": "2026-11-11T09:00:00-03:00",
      "endsAt": "2026-11-11T09:30:00-03:00"
    }
  ]
}
```

- `canCancel` só é `true` para reservas pendentes em conversa ativa. O cancelamento revalida isso no servidor, mesmo que o cliente tenha recebido `true`.
- A listagem não renova a atividade da conversa.
- A busca é restrita à conversa. Não há pesquisa de pacientes por nome.

## Interações do bot

`POST /api/conversations/{id}/interactions` processa uma ação do paciente.

**Requisição**

```json
{
  "actionId": "act_2",
  "expectedRevision": 1,
  "input": {"type": "select_option", "optionId": "opt_dermatology"}
}
```

| Campo | Descrição |
|---|---|
| `actionId` | Identificador novo para cada ação. Reenvios da mesma ação mantêm o mesmo ID. |
| `expectedRevision` | `revision` recebida na última resposta. |
| `input` | Entrada da ação, conforme a tabela abaixo. |

**Tipos de `input`**

| `type` | Campos | Uso |
|---|---|---|
| `select_option` | `optionId` | Menu, especialidade, primeira consulta ou retorno, continuar. |
| `select_slot` | `slotId` | Horário escolhido entre os oferecidos na tentativa atual. |
| `submit_patient` | `patient.name`, `patient.birthDate` | Identificação para a primeira reserva. |
| `cancel_appointment` | `appointmentId` | Cancela uma reserva pendente da conversa. |
| `exit` | nenhum | Encerra a conversa imediatamente. |

**Resposta 200**

```json
{
  "conversation": {
    "id": "cv_1",
    "effectiveStatus": "active",
    "revision": 2,
    "step": "visit_kind",
    "attemptId": "attempt_1"
  },
  "messages": [
    {
      "id": "msg_3",
      "author": "bot",
      "text": "É primeira consulta ou retorno em Dermatologia?",
      "sentAt": "2026-11-10T12:00:20-03:00"
    }
  ],
  "view": {
    "type": "options",
    "options": [
      {"id": "opt_first_visit", "label": "Primeira consulta"},
      {"id": "opt_return", "label": "Retorno"}
    ]
  },
  "availableActions": ["exit"],
  "result": null
}
```

**Campos da resposta**

| Campo | Descrição |
|---|---|
| `conversation` | Estado público: `id`, `effectiveStatus`, `revision`, `step`, `attemptId`. |
| `messages` | Somente as mensagens novas do bot desta ação. O frontend acrescenta à transcrição local. |
| `view` | Controle atual a renderizar. |
| `availableActions` | Ações globais disponíveis agora. |
| `result` | Resultado estruturado de confirmação ou cancelamento, quando houver. |

**Tipos de `view`**

`options`, `slots`, `patient_form`, `appointments`, `clinic_information`, `closed`. O backend não retorna HTML nem estruturas de tela livres.

**Fluxo completo de agendamento**

| Ordem | Ação | `expectedRevision` | Resultado |
|---|---|---|---|
| 1 | `select_option` com `opt_schedule` | 0 | Pergunta a especialidade. |
| 2 | `select_option` com a especialidade | 1 | Pergunta primeira consulta ou retorno. |
| 3 | `select_option` com a visita | 2 | Retorna até três horários (`view.type = slots`). |
| 4 | `select_slot` | 3 | Pede nome e nascimento (`view.type = patient_form`). |
| 5 | `submit_patient` | 4 | Cria o paciente e a reserva. `result.type = appointment_confirmed`. Volta ao menu. |

**Regras da interação**

- **Revisão:** `expectedRevision` diferente do estado atual retorna 409 `STALE_CONVERSATION_STATE`.
- **Idempotência:** mesmo `actionId` com o mesmo conteúdo devolve o resultado anterior, sem repetir busca, reserva ou avanço. Mesmo `actionId` com conteúdo diferente é conflito.
- **Seleção de horário:** revalida a disponibilidade e pode ser recusada. Não bloqueia o horário.
- **Confirmação:** é transacional. Só retorna sucesso depois de persistir a reserva.
- **Primeira reserva:** o envio válido de nome e nascimento conclui o agendamento, sem tela extra.
- **Reservas seguintes da mesma conversa:** a seleção válida do horário confirma usando o paciente já identificado. Nome e nascimento não são pedidos de novo.
- **Sair:** encerra a conversa com mensagem de adeus. Não cancela reservas já confirmadas. Incrementa `revision`, como qualquer interação aceita.
- **Retorno ao menu:** após qualquer tarefa concluída. A conversa não é encerrada.

## Regras que afetam as respostas

**Status das consultas** (derivado, não armazenado):

1. **Cancelada:** houve cancelamento. Tem prioridade sobre o tempo.
2. **Completa:** não cancelada e o instante atual é igual ou posterior ao fim do horário.
3. **Pendente:** demais casos.

Completa não significa que o paciente compareceu. Não há registro de faltas.

**Abandono:** conversa sem encerramento explícito e com última interação há mais de uma hora. Não é persistido. Conversas abandonadas não são reabertas. Um novo atendimento começa em uma conversa nova.

**Cancelamento:** só pendentes da conversa atual. Canceladas permanecem no histórico. O horário volta a ser oferecido se ainda for futuro.

**Pacientes:** cada conversa tem no máximo um paciente, exclusivo dela. Nome não é único. Dados iguais em outra conversa não reaproveitam cadastro.

**Horários oferecidos:** até dois dias diferentes da semana atual e até um horário da próxima semana. A semana vai de domingo a sábado, no fuso de Brasília. Se não houver horários suficientes, a resposta traz menos opções.

## Fora do escopo

- Autenticação e autorização.
- CRUD público de pacientes, médicos, salas, especialidades, horários ou roteiro.
- Endpoints por cartão do painel.
- Exclusão de conversas ou de reservas.
- Edição ou remarcação de consultas pelo painel.
- Exportação de dados e relatórios genéricos.
- Retomada de conversas abandonadas.
- Integração com WhatsApp ou outros canais.

## Documentação complementar

| Documento | Conteúdo |
|---|---|
| `docs/escopo/escopo-kenko-v2.md` | Regras de negócio, métricas e critérios de aceitação. |
| `docs/especificacao/kenko-backend-api.md` | Contratos completos, exemplos de JSON e consultas conceituais de analytics. |
| `docs/especificacao/kenko-bot-api.md` | Estado conversacional, validação, idempotência e confirmação transacional do bot. |