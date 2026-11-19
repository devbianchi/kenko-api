# Modelo de dados — Kenko API

Descreve o schema PostgreSQL do backend: tabelas, relacionamentos, constraints, índices e a sequência de migrations SQL aplicadas pelo runner em TypeScript.

Documentos complementares:

- [Diagrama](diagrama.md)
- [Migrations](migrations.md): lista de V1 a V23, com status e motivo de cada uma
- [Dicionário de dados](dicionario-de-dados.md): colunas, tipos e regras por tabela

Decisões que sustentam este modelo: [ADR-0001](../adr/0001-postgresql.md), [ADR-0006](../adr/0006-idempotencia-e-revisao.md) e [ADR-0007](../adr/0007-indice-unico-parcial-reserva.md).

## Convenções

| Item | Regra |
|---|---|
| Nomes | Tabelas e colunas em `snake_case`, em português, no singular (`clinica`, `horario`). |
| Chaves primárias | `id_<tabela>`, do tipo `INT GENERATED ALWAYS AS IDENTITY`. |
| Chaves estrangeiras | `id_<tabela_referenciada>`, com `REFERENCES`. |
| Instantes | `TIMESTAMPTZ`. Data de negócio sem hora: `DATE`. |
| Fuso de negócio | `America/Sao_Paulo`, aplicado na aplicação, não no banco. |
| Status de consulta | Derivado (cancelada, completa, pendente). Não há coluna de status. |
| Abandono | Calculado por query. Não há coluna de abandono. |
| Textos do roteiro | `TEXT`. Rótulos curtos: `VARCHAR`. |

## Visão geral dos grupos

| Grupo | Tabelas | Mudança |
|---|---|---|
| Dados auxiliares | `clinica`, `expediente`, `especialidade`, `medico`, `sala`, `horario` | Existentes. `especialidade` corrigida. |
| Roteiro | `passo_roteiro`, `opcao_roteiro` | Existentes. Corrigidas. |
| Pacientes | `paciente` | Nova. |
| Conversas | `conversa`, `tentativa`, `interacao`, `evento_conversa`, `acao_processada` | `conversa` alterada. Demais novas. |
| Reservas | `reserva` | Nova. |

## Pendências de decisão

| # | Pendência | Impacto | Responsável |
|---|---|---|---|
| P1 | Confirmar que V1 a V9 não foram aplicadas em nenhum ambiente. | **Decidido:** nunca aplicadas. As correções editam os arquivos. | Equipe |
| P2 | `opcao_roteiro.acao` é texto livre. Definir o conjunto fechado de ações (`go_menu`, `exit`, `schedule`, etc.) ou uma tabela de referência. | **Decidido:** `CHECK` fechado na V8. | Equipe |
| P3 | Confirmar a lista de etapas do roteiro (`etapa` em `passo_roteiro`). | **Decidido:** lista em inglês na V7, ver `migrations.md`. | Equipe |
| P4 | Revisão incrementa em `Sair` e em abandono? | **Decidido:** `Sair` incrementa a revisão, por ser interação aceita. Abandono não incrementa, por ser derivado e sem escrita. | Equipe |
| P5 | Coluna `inicio` em `conversa` é `TIMESTAMPTZ` com default? Quem preenche: banco ou aplicação? | **Decidido:** sem default; a aplicação preenche com o `Clock`. | Equipe |