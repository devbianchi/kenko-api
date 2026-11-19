# Roteiro da apresentação

Cerca de 20 minutos de fala e demonstração. A demonstração usa o `requests.http` na ordem dos números: cada passo depende do anterior.

## Antes de começar (15 minutos antes)

1. Recarregar a demonstração, conforme [recarga-demonstracao.md](recarga-demonstracao.md).
2. Subir a API com `npm run dev` e confirmar `curl localhost:8080/api/clinic` (200).
3. Abrir `requests.http` no VS Code, com a extensão REST Client.
4. Deixar um terminal pronto na raiz do projeto, para `npm test`.
5. Conferir que a tela do painel e o Showcase (frontend, fora deste repositório) estão no ar, se forem apresentados.

## 1. Problema e escopo (2 min)

- Clínica com atendimento por telefone e agenda em planilha. O bot atende o paciente, e o painel mostra os indicadores.
- Mostrar o [README](../../README.md), seção Funcionalidades, e o [escopo](../escopo/escopo-kenko-v2.md).
- Dizer o que está fora: login, WhatsApp, edição de consultas pelo painel.

## 2. Arquitetura (3 min)

- Camadas: rotas, controller, serviço e repositório. Cada camada só fala com a de baixo.
- Mostrar `src/` na árvore e apontar um arquivo de cada camada, por exemplo `src/routes/conversation.routes.ts`, `src/controllers/conversation.controller.ts`, `src/services/interaction.service.ts` e `src/repositories/reservation.repository.ts`.
- Dizer por que TypeScript estrito e Zod, com a decisão em [ADR-0010](../adr/0010-backend-typescript.md).

## 3. Dados e regras que protegem o sistema (2 min)

- O banco é PostgreSQL 16, com migrations em `src/database/migrations/` (V1 a V23).
- Dupla reserva é impedida pelo banco: um índice único parcial sobre o horário, com as reservas ativas ([ADR-0007](../adr/0007-indice-unico-parcial-reserva.md)).
- Repetição de uma ação não duplica nada: cada ação tem `actionId` e a mesma ação devolve o resultado guardado ([ADR-0006](../adr/0006-idempotencia-e-revisao.md)).

## 4. Demonstração do bot (5 min)

Executar em `requests.http`, na ordem:

- **1 a 4:** saúde, clínica, criação da conversa e leitura do estado. Mostrar o menu e a revisão.
- **5 a 9:** agendar, escolher a especialidade e a primeira consulta, escolher o primeiro horário e informar o paciente. Mostrar que a resposta do passo 9 confirma a reserva e volta ao menu.
- **10 a 12:** abrir a lista de reservas, ver `canCancel` e cancelar.
- **15:** sair da conversa. O passo 16 mostra que uma conversa encerrada recusa novas ações.

Ponto para falar: os ids de horário mudam a cada carga. O arquivo encadeia as respostas, então nada é fixado à mão.

## 5. Erros (2 min)

Executar os passos 13, 14, 17 e 18:

- 409 `STALE_CONVERSATION_STATE`: a tela mudou em outra aba. A revisão antiga é recusada.
- 422 `INVALID_OPTION`: a opção não pertence ao passo atual.
- 400 `INVALID_JSON` e 404 `ROUTE_NOT_FOUND`: formato único, no envelope de erro.

Mostrar o [catálogo de erros](../catalogo-de-erros/README.md): cada código tem status e ação do cliente.

## 6. Painel (3 min)

Executar os passos 19 a 26:

- **Home (19):** totais, melhor dia, pico, melhor sala, mediana e próximas consultas.
- **Calendário (21) e Dia (22):** contagem por data e detalhe com salas e ocupação.
- **Analytics (23 a 25):** mês, semana e ano. Mostrar `meta.period`, o período anterior e o funil.
- **Analytics futuro (26):** 400 `FUTURE_PERIOD`.

## 7. Qualidade (2 min)

Rodar `npm test` e mostrar o total. Depois:

- [Matriz de critérios VAL-01 a VAL-42](../estrategia-de-testes/criterios.md), com a coluna de estado.
- [Desempenho](../desempenho/README.md): medição das consultas e a correção dos filtros por data.
- Testes que provam regras difíceis: reserva disputada, idempotência e a recarga da demonstração depois do fluxo.

## 8. Perguntas (o restante)

Ter à mão o [checklist](checklist.md), para responder sobre cada requisito e sobre as pendências conhecidas.
