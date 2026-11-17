# ADR-0004: Organização do código por feature

**Status:** Substituída por ADR-0010
**Data:** 2026-11-14

## Contexto

O backend tem poucas áreas de negócio, mas com fronteiras claras: clínica, painel, calendário, analytics, conversas e agendamento. Organizar por camada (todos os controllers juntos, todos os serviços juntos) espalharia cada funcionalidade por vários pacotes e dificultaria a revisão em partes.

## Decisão

Organizar o código por feature sob `com.kenko.kenko_api`:

```
shared/        Clock, erros e envelope, configuração de CORS e JSON
clinic/        GET /api/clinic
dashboard/     GET /api/dashboard
calendar/      GET /api/calendar, GET /api/calendar/days/{date}
analytics/     GET /api/analytics (um serviço por bloco de KPI)
conversation/  criação, leitura, interações, máquina de passos
scheduling/    busca de horários, reserva, cancelamento e paciente
```

Dentro de cada feature: controller, serviço e repositório, com DTOs em `record`.

Regra de dependência: uma feature não acessa o repositório de outra. Quando precisar de dados alheios, usa o serviço público da feature dona. Por exemplo, `conversation` pede a `scheduling` a confirmação de uma reserva, e não grava na tabela `reserva` diretamente.

## Consequências

- Cada feature pode ser revisada isoladamente, o que é coerente com a ideia de revisar por módulo.
- Paciente fica em `scheduling`, porque é criado e vinculado no agendamento.
- O risco é duplicar lógica de horário entre `calendar`, `dashboard` e `scheduling`. Essa lógica deve ficar em um único serviço ou função pura, usada pelas demais.

## Alternativas consideradas

- **Camadas técnicas (controller/service/repository no topo):** descartado pelos motivos acima.
- **Módulos Maven separados:** isolamento mais forte, mas custo de build e configuração desproporcional a este escopo. Descartado por ora.