import { routeIntentByAction, type ActionIntentDecision } from "./actionIntentRouter.js";
import { analyzeConfidenceGap, type ConfidenceGapDecision } from "./confidenceGapAnalyzer.js";
import type { IntentMatch } from "./intentSimilarityEngine.js";

export interface HierarchicalClassificationDecision {
  domain: ActionIntentDecision["domain"];
  task: ActionIntentDecision["task"];
  risk: "low" | "medium" | "high" | "critical";
  selected_intent: string;
  action_decision: ActionIntentDecision;
  gap_decision: ConfidenceGapDecision;
  reasons: string[];
}

export function classifyHierarchically(prompt: string, ranked: IntentMatch[]): HierarchicalClassificationDecision {
  const action = routeIntentByAction(prompt);
  const gap = analyzeConfidenceGap(ranked, action);
  const selected = action.resolvedIntent ?? gap.selectedIntent ?? ranked[0]?.intent ?? "general_spec";
  const risk = action.domain === "security" ? "high" : action.domain === "api" ? "medium" : "low";

  return {
    domain: action.domain,
    task: action.task,
    risk,
    selected_intent: selected,
    action_decision: action,
    gap_decision: gap,
    reasons: [...action.reasons, gap.reason],
  };
}
