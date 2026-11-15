# Dicionário de dados

Colunas, tipos e regras. Tabelas de V1 a V9 estão listadas com as alterações. Tabelas novas aparecem completas.

## Dados auxiliares (V1–V6)

### clinica

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_clinica` | INT | PK, identity | |
| `nome` | VARCHAR(100) | NOT NULL | |
| `endereco` | VARCHAR(200) | NOT NULL | |
| `telefone` | VARCHAR(20) | NOT NULL | |

### expediente (V2)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_expediente` | INT | PK, identity | |
| `id_clinica` | INT | NOT NULL, FK `clinica` | |
| `dia_semana` | SMALLINT | NOT NULL, `0..6` | 0 é domingo. |
| `abertura` | TIME | nullable | Nulo quando o dia está fechado. |
| `fechamento` | TIME | nullable | |

Restrição: `UNIQUE (id_clinica, dia_semana)`.

### especialidade (V3, corrigida)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_especialidade` | INT | PK, identity | |
| `id_clinica` | INT | NOT NULL, FK `clinica` | |
| `nome_especialidade` | VARCHAR(60) | NOT NULL | |

Correção: `UNIQUE (id_clinica, nome_especialidade)`. A versão anterior referenciava `nome`, que não existe.

### medico (V4)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_medico` | INT | PK, identity | |
| `id_especialidade` | INT | NOT NULL, FK `especialidade` | Cada médico tem uma única especialidade (RN-14). |
| `nome_medico` | VARCHAR(100) | NOT NULL | |

### sala (V5)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_sala` | INT | PK, identity | |
| `id_clinica` | INT | NOT NULL, FK `clinica` | |
| `nome` | VARCHAR(40) | NOT NULL | |

Restrição: `UNIQUE (id_clinica, nome)`.

### horario (V6)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_horario` | INT | PK, identity | |
| `id_medico` | INT | NOT NULL, FK `medico` | |
| `id_sala` | INT | NOT NULL, FK `sala` | |
| `inicio` | TIMESTAMPTZ | NOT NULL | |
| `fim` | TIMESTAMPTZ | NOT NULL | |

Restrição: `CHECK (fim > inicio)`.

Sugestão de índices (V17): `(id_medico, inicio)` e `(id_sala, inicio)`.

## Roteiro (V7 e V8)

### passo_roteiro (V7, corrigida)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_passo` | INT | PK, identity | |
| `codigo_passo` | VARCHAR(40) | NOT NULL, UNIQUE | Nome técnico usado pelo backend, ex.: `specialty`, `visit_kind`. |
| `etapa` | VARCHAR(30) | NOT NULL, CHECK | Etapa analítica. Lista em [migrations.md](migrations.md#nota-sobre-v7-etapas-do-roteiro). |
| `texto` | TEXT | NOT NULL | Pergunta ou mensagem exibida. |

### opcao_roteiro (V8, ajustada)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_opcao` | INT | PK, identity | |
| `id_passo` | INT | NOT NULL, FK `passo_roteiro` | Passo onde a opção aparece. |
| `id_passo_destino` | INT | nullable, FK `passo_roteiro` | Passo seguinte. Nulo quando a ação encerra ou volta ao menu. |
| `id_especialidade` | INT | nullable, FK `especialidade` | **Nova.** Preenchida apenas nas opções de especialidade. |
| `rotulo` | VARCHAR(100) | NOT NULL | |
| `acao` | VARCHAR(30) | nullable, CHECK | **Ajustada.** Conjunto fechado, pendente em P2. |

## Conversas (V9, ajustada, e novas)

### conversa (V9, ajustada)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_conversa` | INT | PK, identity | |
| `contato` | VARCHAR(20) | NOT NULL, UNIQUE | Gerado no frontend. Sem telefone real. |
| `id_passo_atual` | INT | NOT NULL, FK `passo_roteiro` | |
| `id_paciente` | INT | nullable, FK `paciente` | **Nova.** Preenchida na identificação. Exclusiva da conversa. |
| `id_tentativa_atual` | INT | nullable, FK `tentativa` | **Nova.** Adicionada em V18 por dependência circular. |
| `inicio` | TIMESTAMPTZ | NOT NULL | Ver pendência P5. |
| `ultima_interacao` | TIMESTAMPTZ | NOT NULL | **Nova.** Base do abandono. Atualizada por interação do paciente, nunca por GET. |
| `revisao` | INT | NOT NULL, DEFAULT 0 | Controle de conflito (ADR-0006). |
| `encerrada_em` | TIMESTAMPTZ | nullable | |
| `encerramento_motivo` | VARCHAR(30) | nullable | |
| `encerramento_etapa` | VARCHAR(30) | nullable | Etapa analítica de saída, não o nome técnico. |

Índices (V17): `(inicio)`, `(contato)` já coberto pelo UNIQUE.

Restrição: `CHECK (encerrada_em IS NULL OR encerramento_motivo IS NOT NULL)`.

### paciente (V10, nova)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_paciente` | INT | PK, identity | |
| `id_conversa` | INT | NOT NULL, UNIQUE, FK `conversa` | Paciente pertence a exatamente uma conversa (RN-06). |
| `nome` | VARCHAR(100) | NOT NULL | Não único. |
| `data_nascimento` | DATE | NOT NULL | Não pode ser futura (validado na aplicação). |

Nota: `id_conversa` UNIQUE garante a exclusividade. Como `conversa.id_paciente` também existe, a consistência entre os dois lados é garantida pela transação de identificação. Ver P6 se a redundância for considerada desnecessária.

### tentativa (V11, nova)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_tentativa` | INT | PK, identity | |
| `id_conversa` | INT | NOT NULL, FK `conversa` | |
| `numero` | SMALLINT | NOT NULL | Sequencial dentro da conversa. |
| `id_especialidade` | INT | nullable, FK `especialidade` | Preenchida após a triagem. |
| `tipo_visita` | VARCHAR(20) | nullable, CHECK (`primeira_consulta`, `retorno`) | Preenchida após a segunda pergunta. |
| `id_horario_selecionado` | INT | nullable, FK `horario` | Seleção, não reserva. |
| `resultado` | VARCHAR(20) | nullable, CHECK | `available`, `no_slots`, `confirmed`, `exited`, `abandoned`. |
| `iniciada_em` | TIMESTAMPTZ | NOT NULL | |
| `finalizada_em` | TIMESTAMPTZ | nullable | |

Restrição: `UNIQUE (id_conversa, numero)`.

### interacao (V12, nova)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_interacao` | BIGINT | PK, identity | Volume maior que as demais. |
| `id_conversa` | INT | NOT NULL, FK `conversa` | |
| `autor` | VARCHAR(10) | NOT NULL, CHECK (`bot`, `paciente`) | |
| `instante` | TIMESTAMPTZ | NOT NULL | |

Índice (V17): `(id_conversa, instante)`.

### acao_processada (V13, nova)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_acao_processada` | BIGINT | PK, identity | |
| `id_conversa` | INT | NOT NULL, FK `conversa` | |
| `action_id` | VARCHAR(64) | NOT NULL | Enviado pelo cliente. |
| `hash_entrada` | CHAR(64) | NOT NULL | SHA-256 do input normalizado. |
| `resultado` | JSONB | NOT NULL | Resposta estruturada, devolvida em reenvios. |
| `criada_em` | TIMESTAMPTZ | NOT NULL | |

Restrição: `UNIQUE (id_conversa, action_id)`. É o que garante a idempotência em corrida (ADR-0006).

### evento_conversa (V14, nova)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_evento` | BIGINT | PK, identity | |
| `id_conversa` | INT | NOT NULL, FK `conversa` | |
| `id_tentativa` | INT | nullable, FK `tentativa` | Nulo para eventos fora de agendamento, como menu. |
| `tipo` | VARCHAR(40) | NOT NULL, CHECK | `STARTED_SCHEDULING`, `ANSWERED_SPECIALTY`, `SLOT_SEARCH_RESULT`, `SELECTED_SLOT`, `APPOINTMENT_CONFIRMED`, `EXITED`. |
| `instante` | TIMESTAMPTZ | NOT NULL | |
| `id_especialidade` | INT | nullable, FK `especialidade` | |
| `id_horario` | INT | nullable, FK `horario` | |
| `id_reserva` | INT | nullable, FK `reserva` | Preenchida em `APPOINTMENT_CONFIRMED`. |

`NO_SLOTS` não é tipo de evento: é a combinação de `SLOT_SEARCH_RESULT` com ausência de horários, registrada em `busca_sem_horario` (V15).

Índices (V17): `(id_conversa, tipo)` e `(tipo, instante)`.

### busca_sem_horario (V15, nova)

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_busca` | BIGINT | PK, identity | |
| `id_conversa` | INT | NOT NULL, FK `conversa` | |
| `id_tentativa` | INT | NOT NULL, FK `tentativa` | |
| `id_especialidade` | INT | NOT NULL, FK `especialidade` | |
| `instante` | TIMESTAMPTZ | NOT NULL | Instante da busca, usado nas métricas (MET-A05). |

Cada linha é uma ocorrência. Não há unicidade por conversa e especialidade, porque repetições contam (RN-21).

## Reservas (V16, nova)

### reserva

| Coluna | Tipo | Restrições | Observação |
|---|---|---|---|
| `id_reserva` | INT | PK, identity | |
| `id_horario` | INT | NOT NULL, FK `horario` | |
| `id_paciente` | INT | NOT NULL, FK `paciente` | |
| `id_conversa_origem` | INT | NOT NULL, FK `conversa` | Vínculo de origem obrigatório (RN-09, RN-18). |
| `confirmada_em` | TIMESTAMPTZ | NOT NULL | Base da duração de atendimento. |
| `cancelada_em` | TIMESTAMPTZ | nullable | Preenchida somente no cancelamento. |

Índice único parcial, a garantia de dupla reserva (ADR-0007):

```sql
CREATE UNIQUE INDEX uq_reserva_horario_ativa
    ON reserva (id_horario)
    WHERE cancelada_em IS NULL;
```

Índice de origem (V17): `(id_conversa_origem)`.

Status (completa, pendente, cancelada) é derivado: cancelada se `cancelada_em` não é nulo; completa se não cancelada e `horario.fim <= agora`; pendente nos demais casos.

## Índices consolidados (V17)

| Tabela | Colunas | Finalidade |
|---|---|---|
| `horario` | `(id_medico, inicio)` | Busca de horários por médico. |
| `horario` | `(id_sala, inicio)` | Ocupação e calendário por sala. |
| `conversa` | `(inicio)` | Coorte de conversas. |
| `interacao` | `(id_conversa, instante)` | Última atividade. |
| `evento_conversa` | `(id_conversa, tipo)` | Marcos do funil. |
| `evento_conversa` | `(tipo, instante)` | Métricas por período. |
| `reserva` | `(id_conversa_origem)` | Listagem de reservas da conversa. |

## Pendências de modelo

| # | Pendência | Observação |
|---|---|---|
| P6 | `paciente.id_conversa` e `conversa.id_paciente` representam o mesmo vínculo nos dois sentidos. | Manter uma das duas. Recomendo manter `conversa.id_paciente` e remover `paciente.id_conversa`, deixando o UNIQUE em `conversa.id_paciente`. Decidir antes de V10. |
| P7 | `horario` não tem coluna de duração; o fim é explícito. | Confirmado pelo escopo (RN-13). Sem ação. |
| P8 | Tipo de `id` em `interacao`, `evento_conversa` e `acao_processada` é BIGINT. Os demais são INT. | Padronizar em INT ou manter BIGINT nas tabelas de alto volume. Decisão da equipe. |