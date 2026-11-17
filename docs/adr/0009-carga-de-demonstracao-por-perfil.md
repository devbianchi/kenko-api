# ADR-0009: Carga de dados de demonstração controlada pelo perfil `demo`

**Status:** Aceita (mecanismo substituído por ADR-0011)
**Data:** 2026-11-16

## Contexto

A apresentação precisa de dados prontos: clínica, profissionais, horários, conversas com diversos desfechos e buscas sem horário. Esses dados alimentam Home, Calendário, Dia e Analytics, e precisam ser reproduzíveis antes de cada apresentação.

A documentação anterior mencionava uma propriedade `kenko.seed` para ligar a carga, mas ela nunca foi definida. O perfil `demo` já descrevia a carga, então havia duas formas de controlar a mesma coisa.

## Decisão

- A carga é ativada somente pelo perfil `demo`. Não existe propriedade `kenko.seed`.
- Os scripts ficam em `src/main/resources/demo/`, em ordem pelo prefixo numérico, e rodam depois do Flyway.
- A carga é idempotente: o início de cada execução remove apenas os registros de demonstração (contato com prefixo `demo_` e horários da janela de demonstração) e reinsere os fatos. Duas cargas produzem os mesmos fatos.
- As datas são relativas à data de carga, e não fixas. Os indicadores envelhecem com o relógio, e a documentação de seeds orienta a recarga antes da apresentação.
- O roteiro do bot (`passo_roteiro` e `opcao_roteiro`) é dado do sistema e vem de migration. Não faz parte da carga de demonstração.
- O perfil `test` não carrega a demonstração, porque não ativa `demo`.

## Consequências

- Só existe um mecanismo para ligar a carga, o perfil. Não há risco de deixar uma propriedade ativada por engano.
- Ambientes com dados reais não devem usar `demo`. A documentação de seeds já alerta sobre isso, e a carga remove apenas registros marcados, mas o perfil ainda deve ser evitado nesses ambientes.
- A recarga sem apagar o banco depende de a identificação dos registros de demonstração continuar estável.

## Alternativas consideradas

- **Propriedade `kenko.seed` booleana:** permitiria ligar a carga sem perfil, em paralelo ao `demo`. Duplicaria o controle e abriria caminho para carga acidental. Descartado.
- **Carga em migration Flyway:** os dados ficariam versionados, mas as datas seriam fixas e envelheceriam. Além disso, dados de demonstração misturariam schema e conteúdo. Descartado.
- **Endpoint administrativo para carga:** exigiria uma superfície de administração que o escopo não prevê, sem autenticação. Descartado.
