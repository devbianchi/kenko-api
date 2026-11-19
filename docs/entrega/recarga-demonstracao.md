# Recarga da demonstração

Como deixar o banco no estado da demonstração antes de apresentar, e depois de qualquer teste manual do fluxo do bot.

## Quando usar

- Antes de cada apresentação.
- Depois de rodar o `requests.http` ou de conversar com o bot pela API. As conversas e reservas criadas nesses testes ficam no banco.

## Passo a passo

1. Parar a API (Ctrl+C no terminal do `npm run dev`).
2. Recarregar a demonstração:

   ```bash
   npm run db:seed
   ```

   A carga apaga a demonstração e tudo o que o bot criou no banco, e depois recria os mesmos fatos: 110 conversas, a clínica, os horários e as especialidades. As datas são relativas ao dia da carga.

3. Subir a API de novo:

   ```bash
   npm run dev
   ```

4. Confirmar que a demonstração está carregada:

   ```bash
   curl http://localhost:8080/api/clinic
   ```

   A resposta é 200 com a clínica `Clínica Demonstração`.

## Base limpa (opcional)

Se for preciso começar do zero, por exemplo depois de uma mudança grande no schema:

```bash
docker compose down -v      # APAGA o volume local e todos os dados do banco de desenvolvimento
docker compose up -d db
npm run db:migrate
npm run db:seed
```

Esse procedimento apaga os dados locais. Use só quando não houver nada a preservar.

## Se a recarga falhar

A carga roda em uma única transação. Se algo falhar, nada muda: a mensagem indica o motivo, e a demonstração anterior continua no banco. A recarga foi testada depois do fluxo completo do `requests.http`, com a mesma contagem de fatos nas duas execuções seguidas (ver [ensaio](ensaio.md)).

## O que a carga aceita

A carga recusa dois casos, sem alterar nada:

- `NODE_ENV=production`.
- Banco com uma clínica que não seja `Clínica Demonstração`.
