# ADR-0013: Entrega do JSON OpenAPI em GET /api/docs

**Status:** Aceita
**Data:** 2026-11-26

## Contexto

Após a especificação do ADR-0012, foi solicitada uma rota HTTP para que uma página customizada no
frontend consuma o documento atualizado da API. O frontend já usa uma URL base terminada em `/api`,
e pode reservar `/docs` para sua própria página. A geração do contrato não depende de PostgreSQL.

## Decisão

- Expor `GET /api/docs`, sem autenticação, com JSON OpenAPI direto e sem envelope `meta/data`.
- Manter Routes → Controller → Service; o serviço lê um artefato local, sem repositório de banco.
- Reutilizar `docs:bundle` antes de `dev` e `build`, gerando `dist/openapi/openapi.json` a partir da fonte versionada.
- Carregar o documento antes de abrir a porta do servidor, verificando JSON, versão OpenAPI e a forma
  mínima de `info` e `paths`. A validação formal completa continua sendo feita no CI com Redocly.
- Reutilizar a instância carregada para todas as requisições. Atualizar o contrato exige gerar e reiniciar.
- Resolver o arquivo a partir do módulo, permitindo executar a entrega de outra pasta sem mudar o caminho.
- Distribuir `dist/` completa. `npm start` não gera documentação nem exige as dependências de desenvolvimento.
- Usar o CORS e o cabeçalho de correlação globais, sem registrar `/docs` na raiz do backend.

## Consequências

- A interface customizada consome `request('/docs')` usando a URL base existente, sem adicionar uma segunda base.
- O documento pode ser consultado mesmo com o banco indisponível.
- Um bundle ausente ou inválido impede a inicialização, com orientação para regenerar a documentação.
- `buildApp` permite injetar o serviço e adia a leitura quando usado isoladamente, preservando os testes
  das outras funcionalidades sem exigir um build anterior. O servidor executável faz a carga antecipada.
- A especificação passa a documentar doze operações, incluindo sua própria rota de entrega.

Esta decisão amplia a forma de distribuição do ADR-0012. A fonte modular, os bundles e as ferramentas
de validação permanecem. A API continua sem servir Swagger UI ou HTML; a apresentação cabe ao frontend.

## Alternativas consideradas

- **GET /docs na raiz do backend:** exigiria tratar uma URL fora da base usada pelo cliente e poderia
  disputar o caminho da página frontend em uma hospedagem compartilhada. Descartada.
- **Gerar a cada requisição:** repete trabalho, exige ferramentas de desenvolvimento no runtime e pode
  produzir documentos inconsistentes durante alterações da fonte. Descartada.
- **Exigir o bundle em todo buildApp:** faria testes de outras funcionalidades dependerem de um artefato
  gerado. A carga antecipada fica no servidor, com injeção disponível para os testes.
