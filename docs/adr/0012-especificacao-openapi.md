# ADR-0012: Especificação OpenAPI independente da hospedagem

**Status:** Aceita
**Data:** 2026-11-26

## Contexto

Os contratos da API estavam descritos em Markdown, schemas de entrada Zod, DTOs e testes. É necessário oferecer documentação completa e legível no Swagger UI, futuramente hospedado separadamente no GitHub Pages ou na Vercel. Nesta etapa será entregue apenas a especificação; o visualizador será de consulta, sem envio de requisições.

Gerar uma descrição somente a partir do Zod não cobre os parâmetros validados manualmente, as respostas, as variantes de `view` e `result`, nem os efeitos de revisão e idempotência. Um HTML isolado também não fornece um contrato estruturado para validação automatizada.

## Decisão

- Manter OpenAPI 3.1.0 em YAML, em `docs/openapi/`, com ponto de entrada único e arquivos por recurso e componente.
- Escrever descrições e exemplos em português. Nomes de campos e valores técnicos preservam o contrato da API.
- Usar Redocly CLI como dependência de desenvolvimento para lint, validação de exemplos e geração de bundles únicos em YAML e JSON.
- Validar exemplos e respostas HTTP dos testes com Ajv 2020, `ajv-formats` e `yaml`. São ferramentas de teste; não substituem Zod nem os validadores de produção.
- Manter Vitest, supertest e Testcontainers como definidos no ADR-0010. Reutilizar os cenários de integração existentes para conferir respostas reais contra a especificação.
- Executar a validação da documentação no CI. Bundles são gerados em `dist/openapi/`, fora do versionamento.
- Não adicionar rota Swagger ou dependência de documentação ao processo Express. HTML, domínio e deploy pertencem à etapa futura de publicação.
- Desabilitar chamadas no futuro Swagger UI por `supportedSubmitMethods: []`; essa configuração não pertence à OpenAPI.

## Consequências

- O contrato pode ser distribuído sem acesso ao repositório, ao banco ou ao processo da API.
- Alterações em rotas e respostas exigem atualizar especificação, exemplos e testes pertinentes. Não existe sincronização automática completa entre TypeScript e OpenAPI.
- Testes de schema verificam forma, tipos e formatos. As regras funcionais, concorrência, persistência e métricas continuam sendo provadas pelos testes existentes e critérios VAL.
- Divergências entre código e documentos são registradas em `docs/openapi/README.md`; a documentação não corrige silenciosamente a implementação.
- A versão da especificação OpenAPI e `info.version` têm papéis diferentes: a primeira identifica o padrão; a segunda acompanha a versão da API.

## Alternativas consideradas

- **Anotações JSDoc nas rotas:** aproximam a descrição do Express, mas misturam uma documentação extensa com adaptadores HTTP e não eliminam a manutenção de exemplos e schemas. Descartada nesta etapa.
- **Gerar tudo a partir do Zod:** útil para entradas, mas insuficiente para respostas, parâmetros manuais e contratos conversacionais atuais. Descartada como solução completa.
- **Servir Swagger UI pela API:** acopla o visualizador ao processo Express e não atende à publicação separada solicitada. Descartada.
- **Apenas Markdown:** preserva explicações, mas não gera um contrato validável para Swagger UI. Mantido como complemento narrativo, não como formato de distribuição.
