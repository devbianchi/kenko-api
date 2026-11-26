# OpenAPI — Kenko API

Especificação completa das operações HTTP da API, disponível em **`GET /api/docs`** para uma página customizada no frontend ou outro visualizador. O ponto de entrada editável é [openapi.yaml](openapi.yaml), em OpenAPI 3.1.0, com descrições e exemplos em português. O backend entrega JSON, sem HTML e sem envelope `meta/data`.

## Leitura e organização

| Local                        | Conteúdo                                                                  |
| ---------------------------- | ------------------------------------------------------------------------- |
| `openapi.yaml`               | Metadados, endereço local, tags e índice dos componentes e operações      |
| `paths/`                     | Métodos, parâmetros, corpos, respostas, exemplos e regras por recurso     |
| `components/schemas/`        | Modelos JSON, campos obrigatórios, nulabilidade e variantes discriminadas |
| `components/parameters.yaml` | Parâmetros compartilhados, formatos e limites                             |
| `components/responses.yaml`  | Respostas de erro por categoria HTTP                                      |
| `components/headers.yaml`    | Correlação pelo cabeçalho `X-Request-Id`                                  |
| `components/examples/`       | Exemplos completos de entradas, leituras, controles e resultados do bot   |

Cada referência é relativa ao arquivo que a contém. Os componentes podem apontar para o índice raiz para reutilizar outros componentes; o bundle resolve essas referências em um documento único. Os arquivos YAML são a fonte editável, não um resultado gerado a partir dos schemas Zod.

As doze operações atuais estão documentadas: documentação, saúde, clínica, Home, calendário, Dia, Analytics, criação e lista de conversas, detalhe de conversa, reservas da conversa e interações. Não há operação artificial para representar URL inexistente: o erro geral `ROUTE_NOT_FOUND` está explicado na introdução e no catálogo.

## Como validar e gerar o documento de distribuição

Requer Node.js 24 e `npm ci`. As ferramentas estão nas dependências de desenvolvimento e no lockfile; não é preciso instalar CLIs globalmente nem subir a API para gerar a especificação.

```bash
npm run docs:check
```

Esse comando verifica estrutura, referências, regras de lint, exemplos e formatação; gera os dois bundles; e executa os testes unitários da documentação. Para executar as etapas separadamente:

```bash
npm run docs:lint
npm run docs:bundle
npx vitest run tests/unit/openapi.test.ts tests/unit/openapi-http.test.ts tests/unit/docs.test.ts
```

Artefatos gerados, fora do versionamento:

```text
dist/openapi/openapi.yaml
dist/openapi/openapi.json
```

Ambos contêm o mesmo contrato, sem dependências de arquivos externos. Não edite os bundles: altere a fonte e gere novamente. Para formatar os documentos após uma edição:

```bash
npm run docs:format
```

O CI executa `docs:check` e a suíte completa. Os testes de integração exigem Docker, como os demais testes da API.

## Endpoint e página customizada no frontend

`GET /api/docs` responde 200 com `Content-Type: application/json` e o documento completo gerado,
incluindo este endpoint. Não consulta o PostgreSQL e utiliza os mesmos middlewares de CORS e
correlação das demais rotas. `GET /docs` não é registrado no backend: esse caminho pode ser a página
da aplicação frontend.

`npm run dev` e `npm run build` executam `docs:bundle` automaticamente antes de iniciar/compilar.
O serviço carrega e verifica a forma raiz do JSON antes de o servidor abrir a porta; se o arquivo
não existir ou estiver inválido, a inicialização falha com orientação para gerar o bundle. O caminho
é resolvido a partir do módulo, funcionando tanto em `src/` quanto em `dist/`, independentemente do
diretório de execução. As requisições seguintes usam o documento em memória, sem reler o disco.

Ao editar a especificação durante o desenvolvimento, execute novamente `npm run dev`, ou gere o
bundle e reinicie o processo. Em produção, publique a pasta `dist/` completa, inclusive
`dist/openapi/openapi.json`, e use `npm start`. Redocly e os arquivos-fonte YAML não são necessários
no runtime de produção; eles são usados na etapa de build com as dependências de desenvolvimento.

Com `VITE_API_URL=http://localhost:8080/api`, a página frontend pode usar `request('/docs')` e
interpretar o documento retornado. Os helpers `getData` e `getEnveloped` exigem `meta/data` e não
são adequados para esse endpoint. Em origens distintas, permita a origem publicada do frontend
em `CORS_ALLOWED_ORIGINS`; em um domínio compartilhado, encaminhe `/api/*` ao backend e deixe
`/docs` com a aplicação frontend. A implementação dessa página não faz parte desta entrega.

## Alternativa de visualização com Swagger UI

Além da página customizada, um visualizador pode consumir `/api/docs` ou hospedar o bundle no
mesmo site. A entrega atual não inclui HTML, deploy ou configuração de domínio.

O documento informa `http://localhost:8080` em `servers` porque ainda não há URL pública definida. Os paths já incluem `/api`, e `/health` fica fora desse prefixo. Quando existir um ambiente público, adicione seu endereço real; não invente um domínio nem acrescente `/api` duas vezes.

O site será apenas para consulta. No inicializador do **Swagger UI**, configure:

```javascript
SwaggerUIBundle({
  url: './openapi.json',
  dom_id: '#swagger-ui',
  supportedSubmitMethods: [],
  validatorUrl: null,
});
```

`supportedSubmitMethods: []` desabilita os botões de envio nessa alternativa. Essa opção pertence
ao Swagger UI, não à OpenAPI nem a uma página customizada. O exemplo usa um bundle hospedado
junto do visualizador; se consumir diretamente o backend, use sua URL `/api/docs` e a configuração
de CORS correspondente. Escolher a apresentação e a hospedagem continua sendo uma decisão do frontend.

## Como interpretar os contratos

- Campos usam `camelCase`; identificadores são opacos. Os valores dos exemplos são fictícios, não cadastros fixos disponíveis em qualquer banco.
- Instantes são ISO 8601 com deslocamento; datas de negócio usam `America/Sao_Paulo`. Intervalos incluem início e excluem fim.
- Contagem sem ocorrências é `0`, coleção sem elementos é `[]` e indicador sem base é `null`. O servidor não envia o símbolo visual “—”. Percentuais usam escala 0–100 e não são arredondados; medianas de segundos podem ter parte fracionária.
- Leituras agregadas usam `meta` e `data`, inclusive a clínica. Documentação, saúde, criação, detalhe e interação de conversa têm envelopes próprios.
- GETs não geram mensagens, avançam etapas, refazem buscas funcionais ou renovam atividade. A transcrição é local ao navegador.
- As respostas de erro comuns contêm `error`. O conflito `SLOT_UNAVAILABLE` também contém conversa, mensagens, nova `view`, ações e `result: null`; sua revisão avança.
- As respostas compartilhadas de erro listam os códigos da categoria HTTP. A descrição de cada operação identifica os códigos aplicáveis ao fluxo normal dela; erros gerais de middleware são transversais.
- Variantes de `input`, `view` e `result` têm schemas próprios. Campos extras nas entradas são ignorados pelo Zod atual, e não declarados como rejeitados pelo contrato.

### Exemplo de sequência do bot

| Ação                                              | Revisão enviada no fluxo novo | Efeito                                                   |
| ------------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| Criar com contato novo                            | Não se aplica                 | 201 com saudação e menu, revisão 0                       |
| `select_option: opt_schedule`                     | 0                             | Pergunta especialidade                                   |
| `select_option` com id retornado da especialidade | 1                             | Pergunta primeira consulta ou retorno                    |
| `select_option: opt_first_visit` ou `opt_return`  | 2                             | Executa busca e oferece horários ou aviso de busca vazia |
| `select_slot` com id de uma oferta                | 3                             | Pede paciente na primeira reserva                        |
| `submit_patient`                                  | 4                             | Persiste a reserva e retorna ao menu                     |

Essas revisões ilustram uma conversa sem ações intermediárias. Sempre use a revisão efetivamente recebida. Novas ações usam nova `actionId`; reenvios da mesma ação preservam chave e input. Com paciente identificado na conversa, selecionar um horário na próxima tentativa confirma diretamente. Selecionar não cria bloqueio temporário; concorrência pode produzir 409 com nova oferta.

Exemplos nomeados incluem replay da saudação, busca sem horários, identificação, confirmação, segunda reserva, informações da clínica, listagem, cancelamento, saída, abandono e conflito com/sem novas opções. Mensagens são ilustrativas; o cliente decide pelo estado, ids e códigos, sem comparar textos.

## Autoridade das fontes e diferenças conhecidas

O [escopo](../escopo/escopo-kenko-v2.md) define regras funcionais e métricas. As [especificações aprovadas](../especificacao/kenko-backend-api.md) e o [contrato do bot](../especificacao/kenko-bot-api.md) refinam os contratos. Os [ADRs](../adr/README.md) definem decisões técnicas, considerando suas substituições. A OpenAPI é a representação estruturada e verificável dos contratos HTTP; os guias narrativos continuam explicando contexto e decisões.

Na conferência com o código foram observadas diferenças que esta entrega não corrige na lógica:

| Assunto                    | Situação e tratamento nesta documentação                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Envelope da clínica        | O exemplo antigo mostrava apenas `data`, mas o controller retorna também `meta`. A OpenAPI inclui ambos.                                                                                                                                                  |
| Precedência de erros       | O serviço verifica replay antes do estado efetivo e da revisão; conversa encerrada/abandonada é verificada antes de `expectedRevision`. A ordem atual está descrita na operação, apesar da ordem diferente no catálogo narrativo.                         |
| Instante único             | O contrato exige um instante por requisição. Analytics o compartilha explicitamente, mas algumas leituras consultam o relógio novamente no envelope. A OpenAPI não promete corrigir essa implementação; testes com relógio fixo não provam captura única. |
| Abandono e controle visual | Conversa abandonada pode manter a `view` do passo anterior. `effectiveStatus` e `availableActions` indicam indisponibilidade, e ações novas são rejeitadas. Não se exige `view.type=closed` em todo abandono.                                             |
| Duração em segundos        | A documentação antiga dizia inteiros, mas a mediana de duas amostras centrais pode ser fracionária. Campos de estatísticas usam `number`.                                                                                                                 |
| Estado do projeto          | O cabeçalho antigo do guia de endpoints ainda dizia implementação em andamento. A documentação OpenAPI cobre as rotas existentes, sem inferir novas funcionalidades.                                                                                      |

Uma nova divergência deve ser registrada e resolvida explicitamente antes de modificar regras de negócio. Não altere a implementação apenas para fazê-la coincidir com um exemplo antigo.

## Verificações automatizadas e manutenção

`tests/unit/openapi.test.ts` compara a especificação com as rotas declaradas e montadas no código, exige `operationId` único, confere os códigos e status contra `ERROR_CODES`, valida todos os exemplos de operações e contém controles negativos para schemas incompletos ou permissivos. O inventário acompanha a forma de declaração literal usada nas rotas atuais; uma mudança para registro dinâmico de rotas exige adaptar essa verificação. Redocly também verifica exemplos de parâmetros e referências. Ajv 2020 com `ajv-formats` valida os schemas usados nos testes, incluindo formatos de data.

`tests/unit/openapi-http.test.ts` exercita a aplicação HTTP real para saúde, validação de parâmetros, JSON inválido, payload excessivo, identificador malformado, rota inexistente e indisponibilidade. Essa suíte usa um pool simulado e não comprova persistência, SQL ou concorrência; essas garantias permanecem nos testes com PostgreSQL real.

`tests/unit/docs.test.ts` verifica o endpoint, a preservação do documento, CORS, correlação e ausência
de chamadas ao banco. Também prova a reutilização em memória após a primeira leitura e a rejeição
de arquivo ausente, JSON inválido ou estrutura raiz incompatível, usando arquivos temporários isolados.

O teste de integração de `requests.http` valida o corpo e `X-Request-Id` das respostas reais contra a operação e status documentados, reutilizando o PostgreSQL descartável e o relógio fixo já adotados. Os cenários de reserva e interação também validam as variantes críticas ao serem exercitadas. Validar schema prova forma e tipos; as regras funcionais, fórmulas, concorrência e persistência continuam sendo responsabilidade dos testes existentes, vinculados aos critérios VAL.

Ao mudar uma rota, parâmetro, corpo, resposta ou código:

1. Confira regra aprovada, implementação e teste afetado; registre qualquer divergência.
2. Atualize operação, componentes e exemplos pertinentes. Preserve o `operationId` quando a operação continuar sendo a mesma.
3. Atualize os testes de contrato e os guias narrativos afetados, sem duplicar o schema inteiro em Markdown.
4. Execute `npm run docs:check`, tipos, lint, formatação e a suíte completa.
5. Gere novamente o bundle para o site quando a etapa de publicação estiver disponível.

Não foi definido um processo separado de releases do contrato. `info.version` acompanha a versão atual da API no `package.json`; atualizar a versão deve ser uma decisão da entrega, não um efeito automático do gerador.

## Referências das ferramentas

- [OpenAPI 3.1.0](https://spec.openapis.org/oas/v3.1.0.html)
- [Redocly: lint e bundle](https://redocly.com/docs/cli/guides/lint-and-bundle)
- [Swagger UI: configuração](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/)
