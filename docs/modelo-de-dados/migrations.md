# Migrations

Ordem de execução pelo Flyway. Todas ficam em `src/main/resources/db/migration/`.

**Premissa:** nenhuma migration foi aplicada em ambiente compartilhado (pendência P1). Se alguma já rodou, a coluna "Ação" muda de "editar" para "nova versão" e o item correspondente deve ser revisado.

| Versão | Arquivo | Status | Ação | Motivo |
|---|---|---|---|---|
| V1 | `clinica` | Existente | Manter | Sem alteração. |
| V2 | `expediente` | Existente | Manter | Sem alteração. |
| V3 | `especialidade` | Existente | **Corrigir** | `UNIQUE (id_clinica, nome)` referencia coluna inexistente; a coluna é `nome_especialidade`. A migration falha hoje. |
| V4 | `medico` | Existente | Manter | Sem alteração. |
| V5 | `sala` | Existente | Manter | Sem alteração. |
| V6 | `horario` | Existente | Manter | A proteção contra dupla reserva fica em `reserva` (V18), não aqui. |
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

## Nota sobre V7 (etapas do roteiro)

O bot usa mais passos que o `CHECK` atual aceita. A lista proposta, a confirmar (P3), é:

| Etapa | Passos técnicos que a usam |
|---|---|
| `menu` | menu |
| `triagem` | specialty, visit_kind |
| `escolha_horario` | slot_selection, continue_after_no_slots |
| `dados_paciente` | patient_data |
| `confirmacao` | confirmation |
| `consulta_reservas` | appointments |
| `informacoes` | clinic_information |
| `encerrada` | closed |

A coluna `etapa` guarda a etapa analítica (as cinco barras do funil mais menu, reservas, informações e encerrada). O nome técnico do passo fica em uma coluna separada, `codigo_passo`, para que o backend mapeie a ação sem depender do texto. A correção de V7 inclui essa coluna.

## Ordem de criação dentro das migrations

Tabelas com chave estrangeira para outra criada depois são resolvidas na ordem:

1. `paciente` (V10) depende apenas de `conversa`, que já existe. Mas `conversa.id_paciente` aponta para `paciente`. Essa referência cruzada vai em V18.
2. `tentativa` (V11) depende de `conversa`, `especialidade` e `horario`.
3. `conversa.id_tentativa_atual` aponta para `tentativa`. Também em V18.