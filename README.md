# MCP Prompt Generator

Aplicacao fullstack local que converte pedidos em linguagem natural em SPECs estruturadas, usando um runtime semantico governado com Gemini, Llama/Ollama, validacao de schema, extracao de codigo inline e fallback deterministico.

## Visao Geral

O MCP Prompt Generator recebe um prompt do usuario, classifica a intencao, seleciona um template de SPEC, injeta contexto de codigo quando disponivel e solicita a um provider de IA apenas o conteudo permitido pelo contrato. A estrutura final da SPEC pertence ao sistema, nao ao modelo.

O projeto evoluiu de um gerador simples de prompt para um runtime de compilacao de SPECs com:

- classificacao semantica e hierarquica de intents;
- runtime gate para entradas obrigatorias;
- hidratacao pre-gate de codigo inline;
- prompt compiler consciente de schema;
- guard contra override estrutural da LLM;
- injecao de contexto real do workspace;
- fallback deterministico por template;
- suite golden para regressao de comportamento.

## Principais Funcionalidades

- **Campo unico de entrada**: o usuario cola prompt, codigo, JSON ou contexto no mesmo textarea.
- **Classificacao semantica**: detecta intents como `code_refactor`, `code_analysis`, `api_design`, `frontend_component`, `security_analysis` e outras.
- **Priorizacao de refatoracao**: prompts com verbos como refatorar, reestruturar e modularizar priorizam `code_refactor`, mesmo quando citam termos de API.
- **Runtime Input Gate**: bloqueia execucao com `422` quando uma intent exige dados obrigatorios e eles nao existem.
- **Inline Code Pre-Gate Hydration**: extrai codigo colado no prompt e preenche `inputs.code` antes do gate.
- **Inline Code Extraction**: detecta blocos markdown, snippets TypeScript/JavaScript e JSON colado.
- **Code Context Injection**: seleciona arquivos relevantes do workspace e monta um `CODE_CONTEXT` compacto.
- **Schema-Aware Prompt Compiler**: envia para a LLM um contrato tipado com exemplos validos `content-only`.
- **Schema Authority Guard**: impede a LLM de definir schema, intent, template ou campos estruturais.
- **Strict JSON pipeline**: sanitiza, extrai, repara quando permitido e valida JSON antes da normalizacao.
- **Input Field Inference Guard**: impede que stopwords como `esse`, `para` e `quero` criem campos tecnicos indevidos.
- **Provider governance**: diferencia erros de modelo, quota, auth, timeout e resposta malformada.
- **Golden tests**: validam intents, fallback, JSON, schema, input gate, contexto inline e code pack.

## Arquitetura

Fluxo principal do runtime:

```text
Interface web
  -> POST /prompt-to-spec
  -> classificacao semantica
  -> inline code pre-gate hydration
  -> runtime input gate
  -> selecao de backend
  -> template composition
  -> code context resolver
  -> dependency scanner
  -> code pack builder
  -> schema-aware prompt compiler
  -> Gemini ou Llama/Ollama
  -> JSON stability engine
  -> schema authority guard
  -> semantic governance
  -> quality/confidence engines
  -> fallback deterministico, se necessario
  -> PromptSpecResponse
```

## Fluxo de Execucao

1. O usuario informa tudo no campo unico: pedido, codigo, JSON ou contexto.
2. O frontend envia esse conteudo como `prompt`.
3. O backend classifica a intent com o classificador semantico.
4. Se a intent exigir `code`, o pre-gate tenta extrair codigo inline.
5. O runtime gate bloqueia apenas quando nao ha `inputs.code` nem codigo inline.
6. O router seleciona Gemini, Llama/Ollama ou o builder deterministico.
7. O sistema seleciona/compoe o template da SPEC.
8. O resolver tenta encontrar arquivos reais do workspace e dependencias relacionadas.
9. Snippets inline viram arquivos virtuais como `inline_prompt_1.ts`.
10. O prompt compiler injeta `structural_contract`, exemplo valido e `CODE_CONTEXT`.
11. A LLM retorna somente `{ "content": { ... } }`.
12. O sistema injeta esse conteudo no schema controlado pelo template.
13. A SPEC e validada, normalizada e retornada com metadados de backend, fallback, qualidade e tracing.

## Interface

O frontend fica em `public/index.html` e usa React via CDN. A tela principal contem:

- um textarea unico para prompt, codigo ou contexto;
- seletor de backend (`auto`, `llama`, `gemini`);
- checkbox de modo estrito;
- botao `Gerar Spec`;
- status de conexao com o backend;
- painel de resultado JSON;
- historico local em `localStorage`.

Payload principal enviado ao backend:

```json
{
  "prompt": "texto completo do usuario, incluindo codigo se houver",
  "preferred_backend": "auto",
  "strict_mode": false,
  "user_id": "user_001",
  "team_id": "team_001"
}
```

## Exemplo de Uso

Cole tudo no campo unico:

```ts
refatore esse codigo para melhorar a legibilidade

function processarUsuarios(users: any[]) {
  let resultado: any[] = [];
  return resultado;
}
```

Com esse input, o backend deve:

- classificar como `code_refactor`;
- detectar codigo inline;
- criar `inline_prompt_1.ts`;
- hidratar o runtime gate com `code_source: "inline_prompt"`;
- injetar `CODE_CONTEXT` no prompt da LLM;
- gerar uma SPEC de refatoracao seguindo o template `code_refactor`.

## Resposta Esperada

A resposta segue o contrato `PromptSpecResponse`. Em alto nivel:

```json
{
  "prompt_spec": {
    "task_instruction": "Create a refactor plan...",
    "input_fields": {},
    "output_fields": {}
  },
  "quality_score": 9,
  "validation": {
    "is_valid": true,
    "issues": [],
    "fixes_applied": []
  },
  "ai_backend": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "fallback_used": false
  },
  "fallback": {
    "used_fallback": false,
    "fallback_type": "none",
    "fallback_quality": "none"
  }
}
```

Para `code_refactor`, os campos de saida esperados incluem:

- `refactor_plan`
- `module_boundaries`
- `compatibility_notes`
- `tests`

## Estrutura de Pastas

```text
public/
  index.html                  Interface web estatica
  backend-config.json          Arquivo gerado pelo backend com porta ativa

src/
  index.ts                     API Express, health check e runtime input gate
  services/
    promptSpecService.ts       Orquestracao principal da geracao de SPEC
  ai/
    classifier/                Catalogo, scoring, priorizacao e classificacao hierarquica
    json/                      Sanitizacao, extracao, reparo e retry de JSON
    prompt/                    Schema-aware prompt compiler
    providers/                 Startup probe e failover de modelos
    router/                    Classificador semantico e grafo de execucao
  context/
    inlineCodeExtractor.ts     Extrai codigo colado no prompt
    codeContextResolver.ts     Seleciona arquivos relevantes
    dependencyScanner.ts       Mapeia imports e relacoes por nome
    codePackBuilder.ts         Monta CODE_CONTEXT com limite de tokens
    codeContextMerger.ts       Mescla arquivos reais e virtuais
  governance/
    providers/                 Estado, taxonomia e confiabilidade de providers
    policies/                  Politicas de execucao
    safety/                    Validacao de seguranca
  spec/
    templates/                 Registry, composicao e fallback seguro
    contracts/                 Schema authority e validadores de contrato
    governance/                Runtime gate, semantic governance e hydration
    confidence/                Calculo de confianca
    learning/                  Guardrails para aprendizagem
    builder/                   Construcao deterministica de SPEC
    planner/                   PlanDocument deterministico
  schemas/
    promptSpec.ts              Schemas Zod de request/response
  observability/
    logger.ts                  Logs estruturados
    metrics.ts                 Metricas em memoria
    tracing.ts                 Contexto de tracing
  tests/
    golden/goldenRunner.ts     Suite golden de regressao
```

## Como Rodar

Instale as dependencias:

```bash
npm install
```

Crie o arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Inicie backend e frontend estatico juntos:

```bash
npm run dev
```

Por padrao:

- backend: `http://localhost:3000`
- frontend: `http://localhost:5173`
- health: `http://localhost:3000/health`
- endpoint principal: `POST http://localhost:3000/prompt-to-spec`

O backend tambem escreve `public/backend-config.json` para o frontend descobrir a porta ativa.

## Scripts Disponiveis

Scripts reais do `package.json`:

```bash
npm run backend          # tsx watch src/index.ts
npm run frontend_static  # serve public -l 5173
npm run frontend         # alias para frontend_static
npm run fullstack        # backend + frontend_static com concurrently
npm run dev              # alias para fullstack
npm run build            # compila TypeScript com tsc
npm run test:golden      # build + suite golden
npm start                # executa dist/index.js
```

## Testes

Rode a suite golden:

```bash
npm run test:golden
```

Ela cobre, entre outros pontos:

- classificacao de intents;
- priorizacao de `code_refactor`;
- fallback seguro;
- estabilidade de JSON;
- schema authority;
- runtime input gate;
- hidratacao pre-gate com codigo inline;
- input field inference guard;
- code context resolver;
- inline code extraction;
- schema-aware prompt compiler.

## Variaveis de Ambiente

Exemplo em `.env.example`:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

USE_OLLAMA=true
OLLAMA_MODEL=llama3.2

LLAMA_TIMEOUT_MS=12000
GEMINI_TIMEOUT_MS=25000
LLAMA_MAX_OUTPUT_TOKENS=1024
GEMINI_MAX_OUTPUT_TOKENS=2048

PREFERRED_BACKEND=auto
PORT=3000
```

Notas:

- `GEMINI_API_KEY` e necessario para usar Gemini.
- Ollama precisa estar instalado e com o modelo local disponivel para uso de Llama.
- O sistema possui fallback deterministico quando providers nao estao disponiveis ou quando ha falhas controladas.
- Nunca coloque chaves reais no README ou em commits.

## Observabilidade

O backend usa logs estruturados JSON. Eventos importantes:

- `provider_model_validated`
- `backend_selected`
- `classification_trace_generated`
- `hierarchical_classification_completed`
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

O endpoint `/health` retorna status do backend, providers, estado de modelos e metricas em memoria.

## Roadmap

Proximos passos sugeridos, ainda nao implementados como capacidade completa:

- analise AST-aware para TypeScript/JavaScript;
- embeddings reais para ranking semantico de arquivos;
- memoria de sessao entre requests;
- contexto incremental por projeto;
- medicao historica de qualidade por provider;
- UI para visualizar trace, fallback reason e code context selecionado;
- persistencia de metricas e eventos fora de memoria;
- testes de contrato mais proximos de cenarios end-to-end com providers mockados.

## Status Atual

Status: runtime funcional em desenvolvimento local.

Validacoes esperadas antes de publicar ou abrir PR:

```bash
npm run build
npm run test:golden
```

Ultima revisao deste README: alinhada aos modulos atuais de classificacao semantica, runtime governance, schema enforcement, inline code extraction, code context injection e interface de campo unico.
