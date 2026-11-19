# Matriz de critérios

Cada critério VAL-xx do escopo, com o nível de teste que o prova. "Frontend" indica que o critério é verificado na interface, não pela API.

Estado: **Coberto** quando há teste automatizado que prova o critério no nível indicado; **Frontend** quando o critério é só de tela. Testes de referência estão em `tests/`, pelo título e pelo nome do arquivo.

Níveis: **U** unitário, **R** repositório, **S** serviço, **C** concorrência, **H** HTTP, **M** migrations, **F** frontend.

| ID | Cenário | Nível | Observação | Estado |
|---|---|---|---|---|
| VAL-01 | Criar duas conversas independentes | S, H | Contatos distintos; nenhuma encerrada. | Coberto |
| VAL-02 | Iniciar atendimento com menu automático | H | Resposta de criação traz mensagem e `view` de menu. | Coberto |
| VAL-03 | Triagem com duas perguntas | S | Roteiro fixo; nenhuma terceira pergunta. | Coberto |
| VAL-04 | Busca com capacidade suficiente | U, S | Regra de semana em U; montagem da resposta em S. | Coberto |
| VAL-05 | Confirmar reserva | S, H | Reserva persistida antes da resposta de sucesso. | Coberto |
| VAL-06 | Agendar novamente na mesma conversa | S | Paciente reaproveitado da conversa, não de outra. | Coberto |
| VAL-07 | Disputar horário | C | Uma confirma; outra recebe 409. | Coberto |
| VAL-08 | Acessar reserva de outra conversa | S, H | Cancelamento com `appointmentId` alheio retorna 404. | Coberto |
| VAL-09 | Cancelar reserva elegível | S | Horário volta a ficar disponível. | Coberto |
| VAL-10 | Sair após confirmar | S | Reserva e confirmação preservadas. | Coberto |
| VAL-11 | Buscar sem horário duas vezes | S, R | Duas linhas em `busca_sem_horario`. | Coberto |
| VAL-12 | Inatividade maior que uma hora | U, S | Limite exato em U; rejeição em S. | Coberto |
| VAL-13 | Retornar após abandono | S | Nova conversa; antiga inalterada. | Coberto |
| VAL-14 | Ocultar conversa | F | Retirada da lista local; backend não recebe chamada. | Frontend |
| VAL-15 | Limpar histórico local | F | Dados de negócio intactos no banco. | Frontend |
| VAL-16 | Cancelada após a data | U | Cancelamento prevalece sobre o tempo. | Coberto |
| VAL-17 | Completa no fim do horário | U | Comparação no instante do fim, com relógio fixo. | Coberto |
| VAL-18 | Totais iguais entre calendário, Dia e salas | R, S | Mesma base; verificação cruzada. | Coberto |
| VAL-19 | Ocupação por contagem | R | Horário com cancelada antiga não conta duas vezes. | Coberto |
| VAL-20 | Duração por mediana, uma por conversa | U, R | Confirmações posteriores não geram amostra extra. | Coberto |
| VAL-21 | Iniciar fora do expediente | U, R | Conta no percentual e no mapa de 24h. | Coberto |
| VAL-22 | Filtro semana, mês e ano | R, H | Série muda conforme o filtro. | Coberto |
| VAL-23 | Home e Calendário com filtros | F, H | Filtro da Home só mensal. | Coberto no backend; filtro de tela no frontend |
| VAL-24 | Consulta futura em outro dia | R | Entra nas cinco próximas com data. | Coberto |
| VAL-25 | Demonstração sem login | H | Nenhum endpoint responde 401/403. | Coberto |
| VAL-26 | Indicador reproduzível | R | Mesmo banco e filtros geram o mesmo resultado. | Coberto |
| VAL-27 | Soma de buscas por especialidade | R | Soma igual ao KPI. | Coberto |
| VAL-28 | Várias reservas na mesma conversa | R | Conclusão conta a conversa uma vez; limite de 100%. | Coberto |
| VAL-29 | Mesmos dados em outra conversa | S | Novo contato e novo paciente. | Coberto |
| VAL-30 | Cancelar consulta completa | S | Recusado; horário não liberado. | Coberto |
| VAL-31 | Menos de três opções | U, S | Nenhum preenchimento fora da distribuição. | Coberto |
| VAL-32 | Sair ou abandonar no menu | R | Fora das quatro barras de término. | Coberto |
| VAL-33 | Iniciada em outubro, confirmada em novembro | R | Grupo de início preservado. | Coberto |
| VAL-34 | Abertura e fechamento exatos | U | 07h dentro e 18h fora; 09h dentro e 13h fora no sábado. | Coberto |
| VAL-35 | Série e média móvel | U, R | Média dos três últimos pontos calculáveis. | Coberto |
| VAL-36 | Histograma e P90 | U | Dez minutos em "10+"; nona menor duração. | Coberto |
| VAL-37 | Ausência de dados e arredondamento | U, H | `null` e zero no JSON; arredondamento só na apresentação. | Coberto |
| VAL-38 | Calendário com cinco ou seis linhas | H, F | API não recebe nem devolve layout. | Coberto no backend; grade no frontend |
| VAL-39 | GET não gera efeitos | S, H | Atividade e estado inalterados após leitura. | Coberto |
| VAL-40 | Reenvio após falha de rede | C, S | Mesma `actionId` não duplica. | Coberto |
| VAL-41 | Primeira e segunda reservas | S | Segunda não pede dados novamente. | Coberto |
| VAL-42 | Limites de Analytics | H | Resposta sem campos pessoais ou transcrições. | Coberto |

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