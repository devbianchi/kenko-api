# Entrega acadêmica

Documentos para apresentar e demonstrar o projeto Kenko API.

| Documento | Para que serve |
|---|---|
| [Checklist](checklist.md) | Cada requisito da disciplina, onde ele está no repositório e o estado atual |
| [Roteiro da apresentação](roteiro-apresentacao.md) | Ordem da fala e da demonstração, com os comandos de cada passo |
| [Recarga da demonstração](recarga-demonstracao.md) | Como deixar o banco no estado da demonstração antes de apresentar |
| [Ensaio](ensaio.md) | Registro do ensaio ponta a ponta feito antes da entrega |

O arquivo [`requests.http`](../../requests.http), na raiz, percorre o fluxo completo do bot, o painel e os erros esperados. Ele é executado por um teste de integração (`tests/integration/requests-http.it.test.ts`), então continua válido enquanto a suíte passa.
