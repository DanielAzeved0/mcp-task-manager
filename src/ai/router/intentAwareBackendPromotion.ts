import { logEvent, type TraceContext } from "../../observability/logger.js";
import type { ComplexityRoutingDecision, ComplexitySelectedBackend } from "./complexityRouter.js";

const PROMOTABLE_INTENTS = new Set(["code_refactor", "code_analysis", "architecture_design"]);

function hasGemini(availableBackends: string[]): boolean {
  return availableBackends.includes("gemini");
}

export function promoteBackendForIntentContext(input: {
  semanticIntent: string;
  decision: ComplexityRoutingDecision;
  availableBackends: string[];
  hasAstAnalysis: boolean;
  hasSemanticContext: boolean;
  sessionContextHydrated: boolean;
  trace?: TraceContext;
}): ComplexityRoutingDecision {
  const contextReasons = [
    input.hasAstAnalysis ? "ast_analysis_context" : "",
    input.hasSemanticContext ? "semantic_context" : "",
    input.sessionContextHydrated ? "session_context_hydrated" : "",
  ].filter(Boolean);

  const shouldPromote =
    PROMOTABLE_INTENTS.has(input.semanticIntent)
    && hasGemini(input.availableBackends)
    && contextReasons.length > 0
    && input.decision.selected_backend !== "gemini";

  if (!shouldPromote) {
    logEvent("info", "intent_aware_backend_promotion_skipped", {
      semantic_intent: input.semanticIntent,
      selected_backend: input.decision.selected_backend,
      context_reasons: contextReasons,
      gemini_available: hasGemini(input.availableBackends),
    }, input.trace);
    return input.decision;
  }

  const promoted: ComplexityRoutingDecision = {
    ...input.decision,
    selected_backend: "gemini" satisfies ComplexitySelectedBackend,
    reasons: [...new Set([...input.decision.reasons, "intent_aware_backend_promotion", ...contextReasons])],
  };

  logEvent("info", "intent_aware_backend_promoted", {
    semantic_intent: input.semanticIntent,
    previous_backend: input.decision.selected_backend,
    selected_backend: promoted.selected_backend,
    context_reasons: contextReasons,
  }, input.trace);

  return promoted;
}
