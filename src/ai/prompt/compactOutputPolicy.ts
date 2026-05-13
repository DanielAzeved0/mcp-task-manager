import { logEvent, type TraceContext } from "../../observability/logger.js";

export interface CompactOutputPolicy {
  enabled: boolean;
  reasons: string[];
  limits: Record<string, number>;
  instructions: string[];
}

const CODE_INTENTS = new Set(["code_analysis", "code_refactor"]);

const LIMITS_BY_INTENT: Record<string, Record<string, number>> = {
  code_analysis: {
    strengths_max_items: 2,
    good_practices_max_items: 3,
    weaknesses_max_items: 3,
    improvement_opportunities_max_items: 4,
    evidence_max_chars: 120,
    summary_max_chars: 300,
  },
  code_refactor: {
    refactor_plan_max_items: 4,
    compatibility_notes_max_items: 3,
    tests_max_items: 4,
    module_boundaries_max_keys: 3,
    description_max_chars: 240,
  },
};

const COMPACT_INSTRUCTIONS = [
  "Return compact JSON only.",
  "Do not exceed the item limits.",
  "Keep evidence short.",
  "Prefer concise descriptions.",
  "Never include long code excerpts.",
  "Return the complete JSON object.",
];

export function resolveCompactOutputPolicy(input: {
  semanticIntent: string;
  codeContext?: string;
  semanticAnalysisContext?: string;
  estimatedPromptLength?: number;
  force?: boolean;
  forceReason?: string;
  trace?: TraceContext;
}): CompactOutputPolicy {
  const reasons: string[] = [];
  const hasCodeContext = Boolean(input.codeContext?.trim());
  const hasSemanticAnalysis = Boolean(input.semanticAnalysisContext?.trim());
  const estimatedPromptLength = input.estimatedPromptLength ?? 0;

  if (hasCodeContext) reasons.push("code_context_present");
  if (hasSemanticAnalysis) reasons.push("ast_semantic_analysis_present");
  if (estimatedPromptLength > 6000) reasons.push("prompt_length_above_threshold");
  if (input.force) reasons.push(input.forceReason ?? "forced_compact_output");

  const enabled = CODE_INTENTS.has(input.semanticIntent) && reasons.length > 0;
  const limits = LIMITS_BY_INTENT[input.semanticIntent] ?? {};

  if (!enabled) {
    logEvent("info", "compact_output_mode_skipped", {
      semantic_intent: input.semanticIntent,
      reasons,
      estimated_prompt_length: estimatedPromptLength,
    }, input.trace);
    return {
      enabled: false,
      reasons,
      limits: {},
      instructions: [],
    };
  }

  logEvent("info", "compact_output_mode_enabled", {
    semantic_intent: input.semanticIntent,
    reasons,
    estimated_prompt_length: estimatedPromptLength,
  }, input.trace);
  logEvent("info", "compact_output_limits_applied", {
    semantic_intent: input.semanticIntent,
    limits,
  }, input.trace);

  return {
    enabled,
    reasons,
    limits,
    instructions: COMPACT_INSTRUCTIONS,
  };
}
