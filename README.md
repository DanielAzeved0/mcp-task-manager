# MCP Harness Task Manager

Nome curto do pacote local: `mcp-task`.

Aplicacao local, offline-first, para gerenciar desenvolvimento assistido por IA em sprints auditaveis. O produto combina um gerador governado de SPECs com um shell visual estilo IDE para operar o fluxo:

```text
SPEC -> Contract -> Build -> QA -> Evaluation -> Done
```

O objetivo atual nao e ser um SaaS nem um chatbot aberto. O app funciona como um harness local para manter SPECs, contratos, progresso, QA, avaliacoes, memoria e comandos de validacao em arquivos dentro de `.mcp-task/`.

## Status Atual

Status: MVP local funcional e dockerizado.

Roadmap atual:

```text
SPRINT-001 - IDE Shell Foundation - passed
SPRINT-002 - File-Backed Workspace Runtime - passed
SPRINT-003 - SPEC and Sprint Authoring Flow - passed
SPRINT-004 - Contract Builder and Gatekeeping - passed
SPRINT-005 - Agent Activity and Progress Engine - passed
SPRINT-006 - QA and Evaluation Engine - passed
SPRINT-007 - Explicit Tool Execution Harness - passed
SPRINT-008 - Local Memory and History - passed
SPRINT-009 - Packaging and CLI Foundation - passed
SPRINT-010 - MVP Hardening - passed
SPRINT-011 - Docker Runtime - passed
```

Readiness mais recente:

- SPRINT-010 MVP readiness: `ready`, score `94`.
- SPRINT-011 Docker Runtime: `passed`, score `94`.
- Container Docker validado com `HOST_PORT=3010` quando a porta `3000` estava ocupada.

## Capacidades Atuais

- Shell visual estilo IDE em `public/`.
- API Express local em `src/`.
- Workspace file-backed em `.mcp-task/`.
- Leitura e edicao controlada de SPECs, sprint plans e Contracts Markdown.
- Gate de Contract antes de Build.
- Gate de QA e Evaluation antes de Done.
- Registro de agentes, progresso, logs e eventos locais.
- Memoria local pesquisavel em arquivos Markdown/JSON.
- Harness de ferramentas com comandos propostos, aprovados e executados explicitamente.
- CLI local `mcp-task` para `status`, `doctor`, `start`, `--help` e `--version`.
- Runtime Docker com API e UI estatica no mesmo container.
- Runtime original de prompt-to-spec preservado em `POST /prompt-to-spec`.

## O Que Nao Existe no MVP

- SaaS, usuarios, times, billing ou cloud sync.
- Banco de dados, vector database ou embeddings reais.
- Publicacao npm real.
- Instalador desktop.
- Autenticacao.
- Colaboracao em tempo real.
- Sandbox avancado de sistema operacional.
- Execucao autonoma de comandos sem acao explicita do usuario.

Essas ausencias sao intencionais para manter o produto local, barato, auditavel e simples.

## Interface

O frontend fica em `public/`:

```text
public/
  index.html
  app.js
  styles.css
  backend-config.json
```

A tela principal e um shell IDE com:

- top bar com nome do projeto, sprint atual, status de pipeline e acoes principais;
- sidebar esquerda com Pipeline, Sprints, MCP Tools e Agents;
- area central com artefatos locais, editor/preview Markdown e painel principal;
- painel inferior com terminal visual, logs e eventos;
- sidebar direita com status de sprint, score, checklist e acoes rapidas;
- area de memoria local para busca e registro de decisoes.

O frontend consome a mesma origem quando servido pelo backend ou pelo container. Quando aberto em modo local antigo, usa `http://localhost:3000` como fallback.

## Workspace Local

`.mcp-task/` e a fonte operacional do MVP:

```text
.mcp-task/
  agents/
  contracts/
  docs/
  evaluations/
  logs/
  memory/
  progress/
  qa/
  specs/
  sprints/
  tools/
```

Responsabilidades:

- `specs/`: SPECs em Markdown.
- `sprints/`: sprint plans e `roadmap.md`.
- `contracts/`: contratos de sprint com escopo permitido e criterios de aceite.
- `qa/`: resultados de QA por sprint.
- `evaluations/`: avaliacoes e score final.
- `progress/`: estado de agentes, pipeline e eventos.
- `logs/`: terminal visual e registros operacionais.
- `memory/`: memoria local e decisoes.
- `tools/`: estado do harness de execucao explicita.

## API

Endpoints principais:

```http
GET  /health
GET  /backend-config
POST /prompt-to-spec
GET  /workspace
GET  /workspace/artifact?path=.mcp-task/specs/example.md
POST /workspace/artifact
POST /workspace/progress/event
GET  /workspace/tool-harness
POST /workspace/tool-harness/proposals/package-scripts
POST /workspace/tool-harness/commands/approve
POST /workspace/tool-harness/commands/execute
GET  /workspace/memory
POST /workspace/memory/search
POST /workspace/memory/decisions
```

### `POST /prompt-to-spec`

Contrato principal do runtime semantico:

```json
{
  "prompt": "crie uma spec para endpoints de uma API REST",
  "preferred_backend": "auto",
  "strict_mode": true
}
```

Backends aceitos:

- `auto`
- `gemini`
- `llama`
- `ollama`
- `deterministic_builder`

Quando falta input obrigatorio, a API retorna erro deterministico:

```json
{
  "status": "error",
  "error_code": "missing_required_input",
  "message": "Field 'code' is mandatory for code_refactor intent.",
  "intent": "code_refactor",
  "required_fields": ["code"]
}
```

### Rotas de Workspace

As rotas `/workspace/*` operam arquivos dentro de `.mcp-task/`.

Guardrails atuais:

- caminhos absolutos e traversal (`..`) sao rejeitados;
- leitura fica limitada aos artefatos suportados dentro de `.mcp-task/`;
- escrita e permitida apenas para Markdown em:
  - `.mcp-task/specs/`
  - `.mcp-task/sprints/`
  - `.mcp-task/contracts/`
- sprint plan precisa referenciar uma SPEC Markdown;
- Contract precisa conter campos obrigatorios antes de liberar Build.

## Gerador de SPECs

O runtime original continua disponivel e governado. Ele recebe prompt, codigo, JSON ou contexto e produz `PromptSpecResponse` validado.

Fluxo resumido:

```text
prompt -> semantic classifier -> intent prioritization -> inline code hydration
-> runtime input gate -> template registry -> code context resolver
-> schema-aware prompt compiler -> provider router/fallback
-> JSON stability engine -> schema authority guard -> response
```

Capacidades preservadas:

- classificacao semantica e hierarquica de intents;
- priorizacao entre `code_refactor`, `code_analysis`, `api_design`, `frontend_component`, `security_analysis` e outras intents;
- runtime input gate;
- hidratacao pre-gate com codigo inline;
- extracao de snippets Markdown, TypeScript, JavaScript e JSON;
- injecao de contexto real do workspace;
- prompt compiler consciente de schema;
- guardas contra override estrutural da LLM;
- fallback deterministico por intent;
- suite golden de regressao.

## Estrutura de Pastas

```text
src/
  index.ts                     Bootstrap do servidor
  server/                      App Express, portas, config e startup
  routes/                      Rotas HTTP: prompt, health e workspace
  middleware/                  Handlers de erro e 404
  runtime/                     Estado runtime compartilhado
  services/                    Orquestracao principal de SPECs
  cli/                         CLI local mcp-task
  core/
    mvp/                       Readiness e regras do MVP
  infra/
    file-system/               Persistencia .mcp-task, memoria e artefatos
    mcp/                       Harness de ferramentas e comandos locais
  ai/
    classifier/                Catalogo, scoring e classificacao
    json/                      Sanitizacao, extracao e reparo de JSON
    prompt/                    Schema-aware prompt compiler
    providers/                 Gemini/Ollama/failover
    router/                    Classificador semantico
  cache/                       Cache semantico e embeddings locais simples
  context/                     Extracao e injecao de contexto de codigo
  governance/                  Provider state, policies e safety
  learning/                    Historico persistente
  spec/                        Templates, contracts, builder e governance
  schemas/                     Schemas Zod
  observability/               Logs, metricas e tracing
  tests/
    golden/                    Suite golden de regressao

public/
  index.html                   Shell HTML
  app.js                       UI IDE local
  styles.css                   Estilos do shell
  backend-config.json          Config gerada pelo backend

.mcp-task/                     Workspace operacional local
```

## Como Rodar Localmente

Instale dependencias:

```bash
npm install
```

Crie o `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Inicie backend e frontend estatico juntos:

```bash
npm run dev
```

Por padrao:

- backend: `http://localhost:3000`
- frontend estatico de dev: `http://localhost:5173`
- health: `http://localhost:3000/health`
- endpoint principal: `POST http://localhost:3000/prompt-to-spec`

O backend tambem serve `public/` quando executado via `npm start` apos build.

## Como Rodar com Docker

O container de producao sobe API e UI estatica no mesmo processo Express.

Build manual:

```bash
docker build -t mcp-task:local .
```

Run manual:

```bash
docker run --rm -p 3000:3000 --name mcp-task mcp-task:local
```

Com Docker Compose:

```bash
docker compose up --build
```

Se a porta `3000` ja estiver ocupada:

```bash
HOST_PORT=3010 docker compose up --build
```

No PowerShell:

```powershell
$env:HOST_PORT="3010"; docker compose up --build
```

Depois acesse:

- app: `http://localhost:3000`
- health: `http://localhost:3000/health`
- endpoint principal: `POST http://localhost:3000/prompt-to-spec`

Se voce usou `HOST_PORT=3010`, troque `3000` por `3010`.

O Compose monta estes arquivos locais dentro do container:

```text
./.mcp-task -> /app/.mcp-task
./promptSpecHistory.json -> /app/promptSpecHistory.json
```

Isso preserva o comportamento offline-first e evita banco de dados.

## CLI Local

Depois do build, a CLI fica em `dist/cli/mcp-task.js`.

Comandos:

```bash
npm run build
node dist/cli/mcp-task.js status
node dist/cli/mcp-task.js doctor
node dist/cli/mcp-task.js --help
node dist/cli/mcp-task.js --version
```

Atalho:

```bash
npm run cli
```

`status` le `.mcp-task/` diretamente e mostra sprint atual, Contract, QA, Evaluation, Done gate, memoria local e comandos de ferramenta.

`doctor` valida pre-condicoes locais: Node, `package.json`, metadata do pacote, scripts essenciais, `.mcp-task/` e roadmap.

`start` hoje e um comando de orientacao da CLI. O servidor real ainda e iniciado por `npm start` ou `npm run dev`.

## Scripts Disponiveis

```bash
npm run backend          # tsx watch src/index.ts
npm run frontend_static  # serve public -l 5173
npm run frontend         # alias para frontend_static
npm run fullstack        # backend + frontend_static com concurrently
npm run dev              # alias para fullstack
npm run build            # compila TypeScript com tsc
npm run test:golden      # build + suite golden
npm start                # executa dist/index.js
npm run cli              # executa dist/cli/mcp-task.js apos build
```

## Variaveis de Ambiente

Exemplo:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

USE_OLLAMA=true
OLLAMA_MODEL=llama3.2
OLLAMA_HOST=http://localhost:11434

LLAMA_TIMEOUT_MS=12000
GEMINI_TIMEOUT_MS=25000
LLAMA_MAX_OUTPUT_TOKENS=1024
GEMINI_MAX_OUTPUT_TOKENS=2048

PREFERRED_BACKEND=auto
PORT=3000
```

Notas:

- `GEMINI_API_KEY` e necessario para usar Gemini.
- `USE_OLLAMA=true` habilita Ollama local quando o servidor Ollama estiver rodando.
- Em Docker, `OLLAMA_HOST` padrao aponta para `http://host.docker.internal:11434`.
- `PREFERRED_BACKEND=deterministic_builder` permite uso local sem provider externo.
- Nunca commite `.env` ou chaves reais.

## Setup do Ollama

Instale o Ollama:

```text
https://ollama.ai/download
```

Baixe um modelo:

```bash
ollama pull llama3.2
```

Verifique modelos instalados:

```bash
ollama list
```

Se necessario:

```bash
ollama serve
```

Troubleshooting:

- `model not found`: rode `ollama pull llama3.2`.
- `connection refused`: confirme se `ollama serve` esta ativo.
- Docker no Windows/Mac: use `OLLAMA_HOST=http://host.docker.internal:11434`.

## Validacao

Validacao local recomendada:

```bash
node --check public/app.js
npm run build
npm run test:golden
node dist/cli/mcp-task.js status
node dist/cli/mcp-task.js doctor
node dist/cli/mcp-task.js --help
```

Validacao Docker:

```bash
docker build -t mcp-task:local .
docker compose up -d --build
```

Se `3000` estiver ocupada:

```powershell
$env:HOST_PORT="3010"; docker compose up -d --build
Invoke-WebRequest -UseBasicParsing -Uri http://localhost:3010/health
```

Validacoes ja executadas na SPRINT-011:

- `npm.cmd run build` passou.
- `node --check public/app.js` passou.
- `npm.cmd run test:golden` passou.
- `docker build -t mcp-task:local .` passou.
- `docker compose up -d --build` passou com `HOST_PORT=3010`.
- `GET http://localhost:3010/health` retornou `200`.
- Container ficou `healthy`.

## Testes

A suite golden cobre:

- classificacao de intents;
- priorizacao de `code_refactor`;
- `code_analysis` em portugues;
- fallback seguro por intent;
- estabilidade de JSON;
- schema authority;
- runtime input gate;
- hidratacao pre-gate com codigo inline;
- input field inference guard;
- code context resolver;
- inline code extraction;
- schema-aware prompt compiler;
- validadores de workspace `.mcp-task/`;
- validadores de agentes, progresso, QA e Evaluation;
- harness de comandos aprovados;
- CLI e readiness do MVP.

Execute:

```bash
npm run test:golden
```

## Observabilidade

O backend usa logs estruturados JSON.

Eventos relevantes:

- `provider_model_validated`
- `provider_error_classified`
- `backend_selected`
- `classification_trace_generated`
- `hierarchical_classification_completed`
- `confidence_gap_detected`
- `inline_code_pre_gate_started`
- `inline_code_pre_gate_hydrated`
- `runtime_gate_satisfied_by_inline_code`
- `contextual_input_missing`
- `input_field_candidate_accepted`
- `input_field_candidate_rejected`
- `code_context_resolution_started`
- `inline_code_detected`
- `code_context_file_selected`
- `code_pack_built`
- `code_context_injected`
- `schema_prompt_compiled`
- `json_sanitization_applied`
- `schema_authority_enforced`
- `fallback_template_selected`

`GET /health` retorna status do backend, providers, modelos e metricas em memoria.

## Decisoes de Arquitetura

- `.mcp-task/` e a persistencia operacional do workspace local.
- Markdown e JSON sao preferidos para auditoria humana.
- A IA gera conteudo, nao estrutura.
- Template selection e schema definition pertencem ao sistema.
- `deterministic_builder` e o fallback seguro.
- O app deve funcionar sem banco de dados.
- Tool execution deve ser explicita, aprovada e registrada.
- Builder nao valida o proprio trabalho; QA e Evaluation sao gates separados.
- Docker usa um unico container para API e UI estatica.

## Riscos Conhecidos

- As rotas locais de workspace ainda nao possuem autenticacao.
- `cors()` esta aberto para facilitar desenvolvimento local; antes de uso publico, restringir origem ou adicionar token local.
- `GET /workspace` hoje pode materializar propostas de comandos no estado local; o ideal futuro e separar esse efeito em `POST`.
- `.mcp-task/` pode crescer e exigir paginacao/indexacao incremental.
- O CLI `start` ainda nao inicia o servidor de fato; ele apenas orienta o fluxo.
- O `npm audit` reportou vulnerabilidades existentes em dependencias durante Docker build; tratar em uma sprint de manutencao separada.

## Proximos Passos Sugeridos

- Fechar o hardening de seguranca local: CORS restrito, token local e protecao das rotas de escrita/execucao.
- Separar leitura e escrita de `/workspace`.
- Atualizar `.mcp-task/memory/project.json` para apontar a sprint atual correta quando uma nova sprint passa.
- Adicionar smoke tests de browser com Playwright.
- Corrigir o gerador de novo Contract no frontend para nao reutilizar texto da sprint antiga.
- Tratar vulnerabilidades de dependencia em uma sprint dedicada.
