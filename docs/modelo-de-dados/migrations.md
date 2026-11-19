# Migrations

Ordem de execução pelo runner de migrations (`npm run db:migrate`, em `src/database/migrate.ts`). Todas ficam em `src/database/migrations/`, e cada versão aplicada é registrada em `schema_migrations`.

**Premissa:** nenhuma migration foi aplicada em ambiente compartilhado (pendência P1). Se alguma já rodou, a coluna "Ação" muda de "editar" para "nova versão" e o item correspondente deve ser revisado.

| Versão | Arquivo | Status | Ação | Motivo |
|---|---|---|---|---|
| V1 | `clinica` | Existente | Manter | Sem alteração. |
| V2 | `expediente` | Existente | Manter | Sem alteração. |
| V3 | `especialidade` | Existente | **Corrigir** | `UNIQUE (id_clinica, nome)` referencia coluna inexistente; a coluna é `nome_especialidade`. A migration falha hoje. |
| V4 | `medico` | Existente | Manter | Sem alteração. |
| V5 | `sala` | Existente | Manter | Sem alteração. |
| V6 | `horario` | Existente | Manter | A proteção contra dupla reserva fica em `reserva` (V16), não aqui. |
| V7 | `passo_roteiro` | Existente | **Corrigir** | `CHECK` de `etapa` não inclui os passos do bot. Ver nota abaixo. |
| V8 | `opcao_roteiro` | Existente | **Ajustar** | Acrescentar `id_especialidade` (nullable) e `CHECK` no campo `acao`. |
| V9 | `conversa` | Existente | **Ajustar** | Acrescentar `id_paciente`, `id_tentativa_atual`, `ultima_interacao` e índices. Ver dicionário. |
| V10 | `paciente` | Nova | Criar | Paciente exclusivo de uma conversa. |
| V11 | `tentativa` | Nova | Criar | Percurso de Agendar até o resultado. |
| V12 | `interacao` | Nova | Criar | Autor e instante de cada ação, base da última atividade. |
| V13 | `acao_processada` | Nova | Criar | Idempotência por `actionId` (ADR-0006). |
| V14 | `evento_conversa` | Nova | Criar | Fatos para o funil, términos, duração e buscas. |
| V15 | `busca_sem_horario` | Nova | Criar | Ocorrências de busca vazia (RN-21, MET-A05). |
| V16 | `reserva` | Nova | Criar | Agendamento com índice único parcial (ADR-0007). |
| V17 | `indices_de_consulta` | Nova | Criar | Índices de performance das métricas, separados para revisão. |
| V18 | `ajustes_fk_e_checks` | Nova | Criar | Chaves estrangeiras cruzadas que dependem de tabelas criadas depois (ex.: `conversa.id_tentativa_atual`). |
| V19 | `dados_roteiro_bot` | Dados | Criar | Passos e opções fixos do roteiro do bot (ADR-0009), com `codigo_opcao` estável por passo. |
| V20 | `texto_boas_vindas` | Dados | Criar | Ajusta o texto de boas-vindas do menu ao contrato. |
| V21 | `oferta_horario` | Nova | Criar | Horários oferecidos em cada tentativa, na ordem mostrada, para a escolha validar depois. |
| V22 | `textos_contrato` | Dados | Criar | Textos do contrato no roteiro, com os passos de cancelamento e de volta ao menu. |
| V23 | `indice_horario_inicio` | Nova | Criar | Índice por início do horário, para as consultas de dia, mês e Home por intervalo de instante (fase 9b). |

## Nota sobre V7 (etapas do roteiro)

O bot usa mais passos que o `CHECK` atual aceita. Lista definida na V7 (P3, decidido), com nomes em inglês, iguais aos do funil e dos términos:

| Etapa | Passos técnicos que a usam |
|---|---|
| `menu` | menu |
| `triage` | specialty, visit_kind |
| `slot_selection` | slot_selection, continue_after_no_slots |
| `patient_data` | patient_data |
| `confirmation` | confirmation |
| `appointments` | appointments |
| `clinic_information` | clinic_information |
| `closed` | closed |

A coluna `etapa` guarda a etapa analítica (as barras do funil, mais menu, consultas, informações e encerrada). O nome técnico do passo fica em uma coluna separada, `codigo_passo`, para que o backend mapeie a ação sem depender do texto. A correção de V7 inclui essa coluna.

## Ordem de criação dentro das migrations

Tabelas com chave estrangeira para outra criada depois são resolvidas na ordem:

1. `paciente` (V10) depende apenas de `conversa`, que já existe. Mas `conversa.id_paciente` aponta para `paciente`. Essa referência cruzada vai em V18.
2. `tentativa` (V11) depende de `conversa`, `especialidade` e `horario`.
3. `conversa.id_tentativa_atual` aponta para `tentativa`. Também em V18.