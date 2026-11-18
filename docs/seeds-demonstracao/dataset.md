# Dataset de demonstração

Volumes, distribuição e cobertura. Os números são **metas de carga**, não valores que a aplicação deve exibir. Os indicadores reais saem das queries sobre estes fatos.

## Cadastros

| Entidade | Quantidade | Detalhes |
|---|---|---|
| Clínica | 1 | "Clínica Demonstração", endereço e telefone fictícios. |
| Expediente | 7 linhas | Domingo fechado; segunda a sexta 07h–18h; sábado 09h–13h. |
| Especialidades | 4 | Clínico geral, Dermatologia, Ortopedia, Cardiologia. |
| Médicos | 4 | Um ou dois por especialidade. Cada um com uma única especialidade (RN-14). |
| Salas | 6 | Sala 1 a Sala 6. |

Médicos sugeridos:

| Médico | Especialidade |
|---|---|
| Dra. Helena | Dermatologia |
| Dr. Paulo | Dermatologia |
| Dr. Marcos | Clínico geral |
| Dra. Beatriz | Clínico geral |
| Dr. Rafael | Ortopedia |
| Dra. Carla | Cardiologia |

## Horários

Horários de 30 minutos, distribuídos em dias úteis e sábado, nas semanas de referência (ver [estratégia de datas](estrategia-de-datas.md)).

| Grupo | Janela | Volume aproximado |
|---|---|---|
| Passado recente | 60 dias antes da referência | Horários de 30 min nos dias úteis e sábados, com reservas (completas e canceladas). |
| Semana atual e próxima | Da semana corrente até 14 dias à frente | Horários livres e parcialmente reservados, para busca e próximas consultas. |
| Futuro distante | Além de 14 dias | Não cadastrado. |

Cada médico tem horários no expediente da clínica. Cada horário tem uma sala fixa. O seed não cria horários fora do expediente.

## Conversas

Volume-alvo: **cerca de 120 conversas** distribuídas nos 60 dias anteriores à referência, com mais concentração em dias úteis e em horário comercial.

| Desfecho | Participação aproximada | Detalhes |
|---|---|---|
| Confirmou agendamento | 40% | Evento `APPOINTMENT_CONFIRMED`, reserva ativa, paciente vinculado. |
| Confirmou e depois cancelou | 8% | Reserva com `cancelada_em` preenchido. Mantém o evento de confirmação. |
| Escolheu horário e não confirmou | 7% | Evento `SELECTED_SLOT` sem confirmação. Término em Confirmação ou em Escolha de horário. |
| Viu horários e saiu | 8% | Término por `EXITED` na etapa de escolha. |
| Abandonou após triagem | 7% | Sem encerramento explícito; última interação há mais de uma hora. Término em Triagem. |
| Abandonou com dados do paciente pendentes | 4% | Término em Dados do paciente. |
| Viu sem horários e saiu | 6% | Busca vazia e `EXITED` na etapa de escolha. |
| Só consultou informações | 10% | Não entra no funil. Usado para validar a regra de "Iniciaram". |
| Saiu no menu | 5% | Não entra nas barras de término (MET-A07). |
| Iniciou e escolheu Agendar depois de consultar informações | 5% | Conta no funil a partir da escolha de Agendar. |

Os percentuais são referência. A distribuição exata pode variar em uma ou duas conversas para que cada categoria tenha amostra.

### Cobertura por métrica

| Métrica | O que o dataset precisa ter |
|---|---|
| MET-A01 Conclusão | Conversas que confirmaram e que só escolheram Agendar. |
| MET-A02 e A08 Duração | Pelo menos 25 confirmações, com durações entre 1 e 12 minutos, incluindo alguns acima de dez minutos para o bucket "10+". |
| MET-A03 Fora do expediente | Conversas em sábado tarde, domingo e antes das 07h. |
| MET-A05 e A11 Buscas sem horário | Pelo menos 15 ocorrências, em no mínimo três especialidades, com uma conversa repetindo a busca. |
| MET-A06 Funil | Cada marco com valor menor ou igual ao anterior. Nenhum marco sem conversa correspondente. |
| MET-A07 Términos | Ao menos uma saída e um abandono em cada uma das quatro etapas de agendamento. |
| MET-A09 Mapa de calor | Inícios em todas as faixas de 2h, com maior concentração entre 08h e 12h e 14h e 18h. |
| MET-A10 Série | Conversas em todos os blocos mensais do mês de referência e em pelo menos 3 meses do ano. |
| Home e Dia | Consultas com status completo, pendente e cancelado no mês de referência. Pelo menos um dia com quatro consultas. |
| Próximas consultas | Pelo menos cinco pendentes com início futuro a partir da data de carga. |

## Decisões da implementação

Os números abaixo foram fixados ao implementar `004-conversas.ts`. Cada uma é uma escolha de dados, e deve ser revista se o dataset mudar:

- **110 conversas, não 120.** As faixas de verificação (iniciadas 80–100, confirmadas 40–55, abandonadas 10–20) são as que valem. Com 120 conversas, a faixa de iniciadas seria ultrapassada.
- **Confirmar não encerra.** Conforme o escopo (RN-11), quem confirma ou só consulta informações termina com Sair, um minuto depois da última ação. Por isso as 53 confirmações e as 18 consultas de informação geram `EXITED`. Os 17 abandonos são as conversas que pararam sem encerramento explícito.
- **Mapa de calor com madrugada e noite.** A maior parte das conversas começa entre 08h e 17h. Algumas começam fora do expediente: de madrugada (00h30, 02h30 e 04h30), à noite (19h, 21h e 23h), antes das 07h (06h30), e em sábado à tarde e domingo. Assim todas as faixas de 2h têm inícios.

## Pacientes

- Um paciente por conversa que confirmou (cerca de 50 pacientes).
- Nomes fictícios e variados, sem repetição exata.
- Datas de nascimento entre 1950 e 2020, nunca futuras.
- O mesmo nome pode aparecer em conversas diferentes, com pacientes distintos. Isso testa a regra de não reaproveitamento (RN-06).

## Buscas sem horário

Volume-alvo: entre 15 e 25 ocorrências.

| Especialidade | Ocorrências aproximadas |
|---|---|
| Dermatologia | 8 |
| Ortopedia | 6 |
| Cardiologia | 4 |
| Clínico geral | 2 |

Uma conversa repete a busca duas vezes para a mesma especialidade, o que aparece no KPI como duas ocorrências e na tabela de especialidade como soma.

## Eventos

Cada conversa gera eventos coerentes com seu percurso:

- `STARTED_SCHEDULING` quando escolhe Agendar.
- `ANSWERED_SPECIALTY` após a primeira resposta da triagem.
- `SLOT_SEARCH_RESULT` a cada busca, com ou sem horários.
- `SELECTED_SLOT` quando o horário é escolhido.
- `APPOINTMENT_CONFIRMED` quando a reserva é criada.
- `EXITED` quando há saída explícita.

Conversas que não escolheram Agendar não geram eventos de agendamento. Conversas abandonadas não geram `EXITED`.

## Verificação do dataset

Após carregar, estas consultas devem retornar valores dentro das faixas acima:

| Verificação | Faixa esperada |
|---|---|
| Conversas com `STARTED_SCHEDULING` | 80 a 100 |
| Conversas com `APPOINTMENT_CONFIRMED` | 40 a 55 |

| Conversas com `EXITED` (saídas por Sair, incluindo após confirmar ou consultar informações) | 93 |
| Saídas durante o agendamento (`EXITED` com tentativa `exited` ou `no_slots`) | 16 |
| Conversas abandonadas (última interação há mais de 1h, sem encerramento explícito) | 10 a 20 |
| Buscas sem horário | 15 a 25 |
| Reservas canceladas | 8 a 12 |
| Consultas completas no mês de referência | pelo menos 5 |
| Próximas consultas pendentes | pelo menos 5 |

Os valores são conferidos pela aplicação de teste de dados (ver seção de falhas em [estratégia de datas](estrategia-de-datas.md#falhas-comuns)), não por assert manual.
