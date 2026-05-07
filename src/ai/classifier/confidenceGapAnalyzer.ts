import type { IntentMatch } from "./intentSimilarityEngine.js";
import type { ActionIntentDecision } from "./actionIntentRouter.js";

export interface ConfidenceGapDecision {
  ambiguityDetected: boolean;
  gap: number;
  selectedIntent?: string;
  reason: string;
}

const SAFER_NON_MUTATING_ORDER = ["code_analysis", "testing_strategy", "code_refactor"];

export function analyzeConfidenceGap(ranked: IntentMatch[], actionDecision: ActionIntentDecision, threshold = 0.15): ConfidenceGapDecision {
  const [first, second] = ranked;
  if (!first || !second) {
    return { ambiguityDetected: false, gap: 1, selectedIntent: first?.intent, reason: "single_intent" };
  }

  const gap = Number(Math.abs(first.similarity - second.similarity).toFixed(4));
  if (gap > threshold) {
    return { ambiguityDetected: false, gap, selectedIntent: first.intent, reason: "clear_gap" };
  }

  if (actionDecision.resolvedIntent && [first.intent, second.intent].includes(actionDecision.resolvedIntent as any)) {
    return { ambiguityDetected: true, gap, selectedIntent: actionDecision.resolvedIntent, reason: "action_router_resolved_gap" };
  }

  const saferIntent = SAFER_NON_MUTATING_ORDER.find((intent) => [first.intent, second.intent].includes(intent as any));
  return {
    ambiguityDetected: true,
    gap,
    selectedIntent: saferIntent ?? first.intent,
    reason: saferIntent ? "safer_non_mutating_intent" : "default_primary",
  };
}
