# Estratégia de datas

Os seeds usam relógio real. Os dados precisam continuar fazendo sentido depois de alguns dias ou semanas, sem que alguém edite os arquivos SQL. Este documento define como as datas são calculadas e o que acontece quando o tempo passa.

## Princípio

Não se grava nenhuma data absoluta nos scripts de horário ou de conversa. Todas são **relativas à data de carga**. A carga usa a data e a hora do banco no momento em que roda, no fuso `America/Sao_Paulo`.

Isso tem duas consequências:

- Carregar hoje ou daqui a um mês produz um histórico coerente em ambos os casos.
- Os indicadores mudam sem novos registros, porque o relógio muda (ADR-0005). Isso é esperado.

## Data de referência

Na carga, o script calcula uma variável `referencia`:

```sql
-- data de referência: hoje em Brasília, às 12h
referencia := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '12 hours';
```

Todos os cálculos partem de `referencia`, não de `now()`. Assim, dentro de uma mesma carga, o histórico não fica dividido por um instante qualquer da madrugada.

Quando a carga roda depois das 12h, o histórico de hoje já tem horários passados. Isso é aceito. O script descarta apenas horários futuros que caiam em fim de semana ou fora do expediente.

## Janelas

| Janela | Intervalo em relação a `referencia` | Uso |
|---|---|---|
| Histórico | de −60 dias até −1 dia | Conversas, eventos, reservas completas e canceladas. |
| Semana atual | do domingo da semana corrente até o sábado | Busca de horários, Dia e Calendário. |
| Próxima semana | do domingo seguinte até o sábado seguinte | Busca de horários (uma opção) e próximas consultas. |
| Próximas consultas | de agora até +14 dias | Pendentes para a Home. |

Semana domingo–sábado em `America/Sao_Paulo`, igual à regra do bot (escopo, RF-02).

## Como os status são produzidos

O status é derivado, não gravado (RN-22). O seed só precisa criar horários e reservas nas datas certas:

| Status | Como o seed produz |
|---|---|
| Completa | Reserva não cancelada em horário com `fim` no passado. |
| Pendente | Reserva não cancelada em horário com `fim` no futuro. |
| Cancelada | Reserva com `cancelada_em` preenchido, em qualquer horário. |

Como a janela de horários futuros é curta (até 14 dias), **as pendentes envelhecem**: depois de alguns dias, viram completas. Por isso o seed inclui pendentes de vários dias à frente. Quando todas expiram, a Home mostra "Nenhuma consulta futura agendada" (estado vazio previsto na escopo), e a demonstração precisa ser recarregada.

## Calendário de envelhecimento

| Tempo desde a carga | Efeito | Ação recomendada |
|---|---|---|
| 0 a 3 dias | Tudo consistente. | Nenhuma. |
| 4 a 10 dias | Pendentes da primeira semana já viraram completas; próximas consultas diminuem. | Recarregar se a apresentação for nessa semana. |
| Mais de 14 dias | Próximas consultas podem estar vazias; buscas de "próxima semana" já são histórico. | Recarregar. |
| Mais de 60 dias | Histórico sai da janela de métricas de "mês atual". | Recarregar antes de apresentar. |

Para uma apresentação, a recomendação é **carregar no dia ou na véspera**.

## Relógio e fuso

- O banco armazena instantes em `TIMESTAMPTZ`. Os cálculos de dia e hora usam `AT TIME ZONE 'America/Sao_Paulo'`.
- A carga nunca depende do fuso da sessão do banco. Todas as conversões são explícitas.
- Horários de consulta são de 30 minutos e começam em horas cheias ou meias horas, em horário de Brasília.

## Horários por dia da semana

Para cada dia útil e sábado da janela, o script cria horários dentro do expediente:

| Dia | Horários de início |
|---|---|
| Segunda a sexta | 07:00 a 17:30 (um médico por sala, com intervalo de 30 min) |
| Sábado | 09:00 a 12:30 |
| Domingo | Nenhum |

Não há horários fora do expediente. Conversas iniciadas fora dele aparecem apenas como conversas, não como agendamentos (MET-A03).

## Falhas comuns

| Sintoma | Causa | Correção |
|---|---|---|
| Alguma faixa de status zerada | Carga rodou em fim de semana, sem horários futuros suficientes | Carregar em dia útil. |
| Próximas consultas vazias logo após carregar | Carga em sexta à tarde; o seed não tem pendentes até a segunda | Aumentar o alcance da janela de pendentes para 21 dias. |
| Duração sem amostras acima de 10 min | Dataset não tem essas conversas | Acrescentar duas conversas com duração de 11 a 13 minutos. |
| Mapa de calor sem sábado | Carga executada sem gerar conversas em sábado | Verificar a distribuição no script `004-conversas.sql`. |
| Erro de `check constraint` ao carregar | Valor de `tipo` ou de `etapa` fora da lista | Conferir contra o [dicionário de dados](../modelo-de-dados/dicionario-de-dados.md). |

Cada falha tem um teste de verificação do dataset (lista em [dataset.md](dataset.md#verificação-do-dataset)). Se o teste falhar, o seed não é considerado pronto para apresentação.

## Por que não usar data congelada

O escopo fala em "relógio real com dados estáticos" (seção 8). Data congelada resolveria a apresentação de hoje, mas o painel pararia de fazer sentido na semana seguinte: próximas consultas, calendário de hoje e métricas de mês atual dependem do relógio.

A janela relativa mantém a demonstração utilizável sem alteração no código, ao custo de exigir recarga periódica. Essa troca foi aceita no escopo.
