# Desempenho das consultas

Medição das consultas de Analytics, da Home, do calendário e do Dia em volume de um ano, com `EXPLAIN (ANALYZE, BUFFERS)` no PostgreSQL 16. Os números são de uma máquina de desenvolvimento, sem controle de cache, e servem para comparar planos, não para prometer tempo de resposta em produção.

## Volume

Carga determinística em `carga-sintetica.sql`, de 1º de novembro de 2025 a 31 de outubro de 2026:

| Tabela | Linhas |
|---|---|
| `conversa` | 150.000 |
| `evento_conversa` | 350.000 |
| `horario` | 37.560 |
| `reserva` | 25.000 (2.500 canceladas) |
| `busca_sem_horario` | 20.000 |

## Como reproduzir

```bash
docker run -d --name kenko-bench -e POSTGRES_USER=bench -e POSTGRES_PASSWORD=bench -e POSTGRES_DB=bench -p 55432:5432 postgres:16
DATABASE_URL=postgresql://bench:bench@localhost:55432/bench npm run db:migrate
docker exec -i kenko-bench psql -U bench -d bench -v ON_ERROR_STOP=1 -q < docs/desempenho/carga-sintetica.sql
docker exec -i kenko-bench psql -U bench -d bench -q < docs/desempenho/explain-analytics.sql
```

O `EXPLAIN` usa junho de 2026 como período e 10/11/2026 12:15 de Brasília como instante de avaliação.

## Resultados das consultas de Analytics

| Consulta | Tempo de execução | Plano relevante |
|---|---|---|
| Coorte do período (facts) | 90,8 ms | `ix_conversa_inicio` e `ix_evento_conversa_tipo` |
| Durações da confirmação | 18,6 ms | `ix_evento_tipo_instante` e `ix_evento_conversa_tipo` |
| Agenda (total e ocupados) | 5,1 ms | leitura sequencial em `horario`, depois índice parcial de `reserva` |
| Buscas sem horário | 1,0 ms | leitura sequencial em `busca_sem_horario` (20 mil linhas) |
| Mapa de calor | 11,6 ms | `ix_conversa_inicio` (somente índice) |
| Funil | 33,2 ms | leitura sequencial em `evento_conversa` |

Todas ficam abaixo de 100 ms no volume medido. O plano usa os índices da V17 onde o filtro permite: `ix_conversa_inicio` na faixa de início, `ix_evento_conversa_tipo` nas verificações de marco e `uq_reserva_horario_ativa` na ocupação.

## Filtros por dia no calendário, Dia e Home

Antes, os filtros de calendário, Dia e Home comparavam `(inicio AT TIME ZONE 'America/Sao_Paulo')::date`. Essa expressão sobre a coluna impede o uso de índice, então o plano lia `horario` inteiro. Agora os filtros comparam o instante com a meia-noite local da data, em intervalo de início incluído e fim excluído. A troca não muda o resultado: a fronteira de um dia no fuso de Brasília é exatamente a meia-noite local.

| Consulta | Antes | Depois |
|---|---|---|
| Consultas de um dia (`horario`) | 8,4 ms, leitura sequencial | 0,03 ms, somente índice (`ix_horario_inicio`) |
| Totais de um mês (painel, Home e calendário) | 10,4 ms, leitura sequencial | 2,7 ms, leitura por faixa do índice |

A V23 cria `ix_horario_inicio`, porque os índices existentes têm `id_medico` ou `id_sala` na frente e não servem a uma faixa só por início.

## Decisões

- **Índice em `busca_sem_horario(instante)` não foi criado.** O filtro de Analytics lê 1 ms com 20 mil linhas. Entra no momento em que a tabela passar de algumas centenas de milhares de linhas.
- **Funil com leitura sequencial em `evento_conversa` foi mantido.** O custo de 33 ms é aceitável, e um índice adicional encareceria a gravação de cada evento.
- **As consultas de Analytics não foram reescritas.** Já usam intervalos de instante, e o plano delas é bom no volume medido.

## Limites da medição

- Dados sintéticos e determinísticos, sem a distribuição real de horários de uma clínica.
- Uma máquina, sem repetição estatística. Os tempos variam alguns milissegundos entre execuções.
- O volume é de um ano. O planejador pode escolher outros planos com mais dados; a medição deve ser repetida antes de qualquer decisão de produção.
