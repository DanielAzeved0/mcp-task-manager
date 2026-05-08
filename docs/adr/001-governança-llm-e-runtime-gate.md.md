# MCP Prompt Generator --- Arquitetura, Governança e Evolução

**Data:** 2026-05-08

------------------------------------------------------------------------

## Linha do Tempo / Fatos

-   Definição do objetivo do sistema: gerar SPECs estruturadas, não
    responder perguntas abertas.
-   Identificação de falhas no uso do modelo Gemini (modelo inválido /
    deprecated).
-   Implementação de failover automático de modelos no providerRegistry.
-   Introdução de taxonomia de erros para separar falhas de provider de
    erros do usuário.
-   Implementação de classificação semântica hierárquica com boosts e
    penalidades negativas.
-   Correção do fallback perigoso para `api_design`.
-   Introdução de fallback por intent específico.
-   Implementação de STRICT CONTRACT ENFORCEMENT (content-only LLM).
-   Bloqueio estrutural via contractValidator e schemaAuthorityGuard.
-   Ativação obrigatória de strict_json na rota.
-   Implementação de Hard Runtime Input Gate (validação pré-LLM).
-   Bloqueio imediato (422) quando inputs obrigatórios não são
    fornecidos.
-   Isolamento de penalização de provider (reliability não reduzida em
    erro do usuário).
-   Governança de retry: bloqueio de retry em erros determinísticos.
-   Introdução de máquina de estados formal com transições auditáveis.
-   Inclusão de eventos estruturados de observabilidade.
-   Garantia de presença do deterministic_builder como último backend
    candidato.
-   Expansão do retorno da API com provider_state, model_failover_trace
    e classification_decision.
-   Implementação de golden tests cobrindo cenários críticos.

------------------------------------------------------------------------

## Blocos de Contexto

### 1. Modelo e Provider Governance

-   Substituição de modelos Gemini deprecated.
-   Failover estruturado entre versões.
-   Separação entre erro de modelo, quota, timeout e erro estrutural.
-   Provider reliability agora protegida contra erro do usuário.

### 2. Classificação Semântica

-   Introdução de classificação hierárquica por domínio e verbo.
-   Boost de domínio para intents relacionadas a código.
-   Penalidade negativa para intents conflitantes.
-   Detecção de ambiguity e confidence_gap.

### 3. Governança Estrutural da LLM

-   LLM limitada a retornar apenas { "content": { ... } }.
-   Proibição de override estrutural.
-   Schema montado exclusivamente pelo sistema.
-   Validação rígida via Zod + guardas de autoridade.

### 4. Runtime Gate

-   Validação de campos obrigatórios antes da LLM.
-   Nenhum token gasto quando inputs estão ausentes.
-   Nenhum retry ou fallback acionado.
-   Resposta 422 determinística.

### 5. Fallback Inteligente

-   Fallback específico por intent.
-   deterministic_builder sempre disponível.
-   Penalização controlada de qualidade quando fallback acionado.

### 6. Observabilidade

-   Logs estruturados para transições de estado.
-   Métricas para bloqueio runtime e proteção de provider.
-   Health endpoint expandido com estado de provider.

------------------------------------------------------------------------

## Decisões Finais

-   A IA será usada exclusivamente como geradora de conteúdo interno da
    SPEC.
-   A estrutura da SPEC é 100% controlada pelo sistema.
-   O sistema atua como um compilador determinístico governado.
-   Runtime Gate é obrigatório antes da execução da LLM.
-   Provider reliability não será afetada por erro do usuário.
-   Fallback deve ser específico por intent.
-   strict_json permanece sempre ativo.
-   Próximos passos incluem:
    -   Melhorar priorização de intent para refatoração.
    -   Garantir injeção explícita de código no prompt LLM.
    -   Separar specs simples (Ollama) e completas (Gemini).
    -   Implementar embeddings reais.
    -   Aprimorar testes e debug frontend.

------------------------------------------------------------------------

Documento gerado automaticamente a partir da consolidação técnica da
conversa.
