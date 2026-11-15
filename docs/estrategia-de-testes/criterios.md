# Matriz de critérios

Cada critério VAL-xx do escopo, com o nível de teste que o prova. "Frontend" indica que o critério é verificado na interface, não pela API.

Níveis: **U** unitário, **R** repositório, **S** serviço, **C** concorrência, **H** HTTP, **M** migrations, **F** frontend.

| ID | Cenário | Nível | Observação |
|---|---|---|---|
| VAL-01 | Criar duas conversas independentes | S, H | Contatos distintos; nenhuma encerrada. |
| VAL-02 | Iniciar atendimento com menu automático | H | Resposta de criação traz mensagem e `view` de menu. |
| VAL-03 | Triagem com duas perguntas | S | Roteiro fixo; nenhuma terceira pergunta. |
| VAL-04 | Busca com capacidade suficiente | U, S | Regra de semana em U; montagem da resposta em S. |
| VAL-05 | Confirmar reserva | S, H | Reserva persistida antes da resposta de sucesso. |
| VAL-06 | Agendar novamente na mesma conversa | S | Paciente reaproveitado da conversa, não de outra. |
| VAL-07 | Disputar horário | C | Uma confirma; outra recebe 409. |
| VAL-08 | Acessar reserva de outra conversa | S, H | Cancelamento com `appointmentId` alheio retorna 404. |
| VAL-09 | Cancelar reserva elegível | S | Horário volta a ficar disponível. |
| VAL-10 | Sair após confirmar | S | Reserva e confirmação preservadas. |
| VAL-11 | Buscar sem horário duas vezes | S, R | Duas linhas em `busca_sem_horario`. |
| VAL-12 | Inatividade maior que uma hora | U, S | Limite exato em U; rejeição em S. |
| VAL-13 | Retornar após abandono | S | Nova conversa; antiga inalterada. |
| VAL-14 | Ocultar conversa | F | Retirada da lista local; backend não recebe chamada. |
| VAL-15 | Limpar histórico local | F | Dados de negócio intactos no banco. |
| VAL-16 | Cancelada após a data | U | Cancelamento prevalece sobre o tempo. |
| VAL-17 | Completa no fim do horário | U | Comparação no instante do fim, com relógio fixo. |
| VAL-18 | Totais iguais entre calendário, Dia e salas | R, S | Mesma base; verificação cruzada. |
| VAL-19 | Ocupação por contagem | R | Horário com cancelada antiga não conta duas vezes. |
| VAL-20 | Duração por mediana, uma por conversa | U, R | Confirmações posteriores não geram amostra extra. |
| VAL-21 | Iniciar fora do expediente | U, R | Conta no percentual e no mapa de 24h. |
| VAL-22 | Filtro semana, mês e ano | R, H | Série muda conforme o filtro. |
| VAL-23 | Home e Calendário com filtros | F, H | Filtro da Home só mensal. |
| VAL-24 | Consulta futura em outro dia | R | Entra nas cinco próximas com data. |
| VAL-25 | Demonstração sem login | H | Nenhum endpoint responde 401/403. |
| VAL-26 | Indicador reproduzível | R | Mesmo banco e filtros geram o mesmo resultado. |
| VAL-27 | Soma de buscas por especialidade | R | Soma igual ao KPI. |
| VAL-28 | Várias reservas na mesma conversa | R | Conclusão conta a conversa uma vez; limite de 100%. |
| VAL-29 | Mesmos dados em outra conversa | S | Novo contato e novo paciente. |
| VAL-30 | Cancelar consulta completa | S | Recusado; horário não liberado. |
| VAL-31 | Menos de três opções | U, S | Nenhum preenchimento fora da distribuição. |
| VAL-32 | Sair ou abandonar no menu | R | Fora das quatro barras de término. |
| VAL-33 | Iniciada em outubro, confirmada em novembro | R | Grupo de início preservado. |
| VAL-34 | Abertura e fechamento exatos | U | 07h dentro e 18h fora; 09h dentro e 13h fora no sábado. |
| VAL-35 | Série e média móvel | U, R | Média dos três últimos pontos calculáveis. |
| VAL-36 | Histograma e P90 | U | Dez minutos em "10+"; nona menor duração. |
| VAL-37 | Ausência de dados e arredondamento | U, H | `null` e zero no JSON; arredondamento só na apresentação. |
| VAL-38 | Calendário com cinco ou seis linhas | H, F | API não recebe nem devolve layout. |
| VAL-39 | GET não gera efeitos | S, H | Atividade e estado inalterados após leitura. |
| VAL-40 | Reenvio após falha de rede | C, S | Mesma `actionId` não duplica. |
| VAL-41 | Primeira e segunda reservas | S | Segunda não pede dados novamente. |
| VAL-42 | Limites de Analytics | H | Resposta sem campos pessoais ou transcrições. |

## Resumo por nível

| Nível | Critérios que dependem dele (principal) |
|---|---|
| Unitário | VAL-04, 12, 16, 17, 20, 21, 31, 34, 35, 36, 37 |
| Repositório | VAL-11, 18, 19, 22, 24, 26, 27, 28, 32, 33 |
| Serviço | VAL-01, 03, 05, 06, 08, 09, 10, 13, 29, 30, 39, 41 |
| Concorrência | VAL-07, 40 |
| HTTP | VAL-02, 25, 42 |
| Frontend | VAL-14, 15, 23, 38 |

Critérios que aparecem em mais de um nível exigem os dois: a regra em unitário e a persistência em integração.