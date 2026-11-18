# Seeds de demonstração — Kenko API

Dados de demonstração carregados no banco para apresentar o painel e o bot com histórico suficiente para os indicadores. Os seeds não fazem parte das migrations de produção: são carregados separadamente, por um script reexecutável.

Documentos relacionados:

- [Dataset](dataset.md): volumes, distribuição e cobertura de cada métrica
- [Estratégia de datas](estrategia-de-datas.md): relógio real, janela relativa e envelhecimento
- [Modelo de dados](../modelo-de-dados/README.md): tabelas que os seeds preenchem
- [Guia de desenvolvimento local](../desenvolvimento-local/README.md): perfis e configuração
- [Escopo, seção 8](../escopo/escopo-kenko-v2.md): exigências originais de preparação

## Objetivo

Garantir que, ao abrir Home, Calendário, Dia, Analytics e o Showcase, a apresentação mostre:

- os três status de consulta (completa, pendente, cancelada);
- um funil com todas as barras preenchidas e em queda coerente;
- términos nas quatro etapas de agendamento e fora delas;
- duração com mediana, P90 e histograma distribuído;
- um mapa de calor com inícios em dias úteis, sábado e fora do expediente;
- buscas sem horário por mais de uma especialidade;
- conversas abandonadas e encerradas por Sair.

Os dados são **fictícios**, mas as operações que os criaram são reais: cada confirmação tem reserva, paciente e evento; cada busca vazia tem ocorrência. Nenhum indicador é gravado como número pronto.

## Princípios

1. **Fatos, não totais.** O seed insere conversas, eventos, reservas e buscas. Os indicadores saem das queries (escopo, seção 8). Inserir totais agregados para imitar gráficos é proibido.
2. **Coerência entre tabelas.** Uma confirmação exige `reserva`, `paciente`, `tentativa`, eventos `SELECTED_SLOT` e `APPOINTMENT_CONFIRMED`. Uma busca vazia exige `busca_sem_horario` e o evento correspondente.
3. **Reexecutável.** O script limpa apenas os dados de demonstração antes de carregar. Rodar duas vezes produz o mesmo resultado.
4. **Relógio real, janela relativa.** Os horários são calculados a partir da data da carga (ver [estratégia](estrategia-de-datas.md)). Nada é fixado no calendário.
5. **Nenhum dado real.** Nomes, endereços e telefones são fictícios. Os contatos não são telefones.

## Como carregar

O comando `npm run db:seed` executa os scripts da pasta `src/database/seeds/`, depois que as migrations estão aplicadas ([ADR-0011](../adr/0011-carga-de-demonstracao-por-script.md)):

```bash
npm run db:migrate
npm run db:seed
```

> **Estado atual:** o comando carrega a demonstração completa: cadastros, horários e 110 conversas com seus desfechos. Os volumes e as faixas de verificação estão em [dataset.md](dataset.md).

Ordem de execução dos scripts (prefixo numérico):

| Script | Conteúdo |
|---|---|
| `000-limpeza.ts` | Remove a demonstração anterior: conversas `demo_`, cadastros e horários da clínica. |
| `001-clinica.ts` | Clínica, expediente e especialidades. |
| `002-profissionais.ts` | Médicos e salas. |
| `003-horarios.ts` | Horários de 30 minutos no expediente, de 60 dias antes até 14 depois da referência. |
| `004-conversas.ts` | 110 conversas com tentativas, interações, eventos, buscas sem horário, pacientes e reservas. |

O roteiro (`passo_roteiro` e `opcao_roteiro`) não é carregado pelo seed. Ele vem de uma migration, porque é conteúdo fixo do produto, não dado de demonstração (escopo, RN-03).

## Regras do script

- **Idempotente:** o script remove a demonstração anterior antes de recriá-la. A trava garante que a base só tem a clínica de demonstração. Se uma reserva real apontar para um horário da demonstração, a carga falha e não apaga nada.
- **Trava:** recusa rodar com `NODE_ENV=production` e em base com outra clínica (ADR-0011).
- **Transacional:** o carregamento inteiro roda em uma transação. Falha em qualquer ponto desfaz tudo.
- **Sem aleatoriedade:** valores são gerados por índice determinístico (`demo_conversa_001`, `demo_conversa_002`). Duas cargas produzem os mesmos fatos.
- **Sem horário fixo:** datas e horas são calculadas pela regra da janela relativa.

## Como resetar

Para reconstruir a demonstração do zero:

```bash
docker compose down -v
docker compose up -d db
npm run db:migrate
npm run db:seed
```

Para recarregar apenas os seeds, sem apagar o banco, basta rodar `npm run db:seed` de novo. O script remove e recria os dados de demonstração.

## Quando recarregar

| Situação | Ação |
|---|---|
| Os horários futuros acabaram (todas as pendentes viraram completas) | Recarregar. |
| Próximas consultas do painel ficaram vazias | Recarregar. |
| Mudou o volume ou a distribuição do dataset | Recarregar e atualizar o [dataset](dataset.md). |
| Dados de uso real foram criados no banco | Não apagar com reset completo; use o recarregamento, que preserva o uso real. |

## Limites

- Os seeds não cobrem todas as combinações possíveis. Cobrem o necessário para a apresentação dos indicadores.
- Os volumes são suficientes para mediana, P90 e histograma com amostras. Não são uma carga de desempenho.
- O `npm run db:seed` se recusa a rodar em base que não seja a de demonstração (ADR-0011). Mesmo assim, não rode em ambiente com dados reais.
- Os testes não usam estes seeds. Cada teste cria seu cenário (ver [dados de teste](../estrategia-de-testes/dados-de-teste.md)).

## Verificação após carregar

Conferir que as métricas têm base:

```sql
SELECT status, COUNT(*) FROM (
  SELECT CASE
           WHEN r.cancelada_em IS NOT NULL THEN 'cancelada'
           WHEN h.fim <= now() THEN 'completa'
           ELSE 'pendente'
         END AS status
  FROM reserva r JOIN horario h ON h.id_horario = r.id_horario
) s GROUP BY status;
```

Os três status devem aparecer. Se algum estiver zerado, a janela relativa precisa de ajuste (ver [estratégia](estrategia-de-datas.md#falhas-comuns)).
