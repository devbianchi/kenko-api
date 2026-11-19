# Ensaio ponta a ponta

Registro do ensaio feito antes da entrega, com o código da fase 10 e um banco novo, do zero.

## Ambiente

| Item | Valor |
|---|---|
| Data | 19/11/2026 |
| Node.js | 26.13.1 no ensaio. O projeto pede a 24 no `.nvmrc`; o ambiente da apresentação deve usar a 24. |
| PostgreSQL | 16, em container descartável na porta 55433, criado só para o ensaio |
| API | `npm run dev` equivalente (`tsx`), porta 8081, apontando para o banco do ensaio |

O ensaio não usou o volume do `docker compose`, para não apagar dados do ambiente de desenvolvimento. O procedimento de base limpa do compose está em [recarga-demonstracao.md](recarga-demonstracao.md).

## Sequência executada

1. **Banco limpo e migrations.** `npm run db:migrate` aplicou V1 a V23 em ordem, sem erro.
2. **Demonstração.** `npm run db:seed` carregou a clínica `Clínica Demonstração`, quatro especialidades, seis médicos, seis salas, horários e 110 conversas.
3. **API.** `GET /health` respondeu `{"status":"ok"}`. `GET /api/clinic` respondeu 200 com os horários e as especialidades.
4. **requests.http, ponta a ponta.** Os 26 passos foram executados na ordem, contra o servidor real. Todos responderam com o status esperado: 200 e 201 nos fluxos, 400, 404, 409 e 422 nos erros esperados. Os ids encadeados vieram das respostas anteriores.
5. **Recarga depois do fluxo.** Antes da recarga o banco tinha 111 conversas, 54 reservas e 3 ofertas de horário, sendo uma conversa e uma reserva do bot. `npm run db:seed` foi rodado duas vezes seguidas. Nas duas, o banco ficou com 110 conversas, 53 reservas, 53 pacientes e nenhuma oferta.
6. **Log do servidor.** Nenhum registro de erro de servidor durante todo o ensaio.

## Problema encontrado e corrigido

A recarga falhava depois de qualquer reserva feita pela API. A limpeza da carga só apagava as conversas com contato `demo_`, mas apagava todos os horários, e as reservas do bot apontavam para eles. A transação era desfeita, e a demonstração ficava quebrada. Uma segunda causa estava na tabela `oferta_horario`, criada depois da limpeza.

A correção fez a limpeza apagar tudo o que a base contém, o que é seguro porque a trava da carga só aceita uma base com a clínica de demonstração. Um teste de integração executa o `requests.http` e depois recarrega a demonstração. Com a limpeza antiga, o teste falha com a violação de chave estrangeira; com a correção, passa.

## Verificação automatizada

- `npm test`: 239 testes em 32 arquivos, todos passando.
- `npm run lint` e `npm run typecheck`: sem erros.
- `tests/integration/requests-http.it.test.ts` executa o `requests.http` inteiro contra a aplicação e confere cada status. Ele também cobre a recarga depois do fluxo.

## O que não foi testado neste ensaio

- **Frontend.** A interface do painel e do Showcase não está neste repositório. Os endpoints foram exercitados, mas as telas não foram abertas.
- **Extensão REST Client.** O arquivo foi validado pelo teste de integração, que lê o mesmo formato e resolve as mesmas expressões (`$guid`, `$localDatetime`, referências a respostas nomeadas). A extensão do VS Code em si não foi aberta neste ensaio.
- **Volume do compose.** O procedimento `docker compose down -v` não foi executado, porque apaga os dados locais do desenvolvedor.
