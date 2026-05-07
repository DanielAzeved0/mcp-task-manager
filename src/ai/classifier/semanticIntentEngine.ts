import { rankSemanticIntentsWithTrace, type IntentMatch } from "./intentSimilarityEngine.js";
import type { ClassificationTrace } from "./classificationScoring.js";
import { classifyHierarchically } from "./hierarchicalClassifier.js";

export interface SemanticIntentResult {
  primary: IntentMatch;
  secondary: IntentMatch[];
  semanticConfidence: number;
  classificationTrace: ClassificationTrace;
}

export function analyzeSemanticIntent(prompt: string): SemanticIntentResult {
  const { matches: ranked, trace } = rankSemanticIntentsWithTrace(prompt);
  const hierarchical = classifyHierarchically(prompt, ranked);
  const selectedPrimary = ranked.find((match) => match.intent === hierarchical.selected_intent) ?? ranked[0];
  const primary = selectedPrimary ?? { intent: "general_spec", similarity: 0, riskBias: 0 };
  const secondary = ranked.slice(1, 4).filter((match) => match.similarity >= Math.max(0.12, primary.similarity * 0.5));
  const separation = primary.similarity - (ranked[1]?.similarity ?? 0);
  const semanticConfidence = Math.max(0.45, Math.min(0.95, 0.55 + primary.similarity * 0.35 + separation * 0.25));
  const classificationTrace: ClassificationTrace = {
    ...trace,
    ambiguity_detected: hierarchical.gap_decision.ambiguityDetected,
    confidence_gap: hierarchical.gap_decision.gap,
    action_intent: hierarchical.action_decision.resolvedIntent,
    domain: hierarchical.domain,
    task: hierarchical.task,
    decision_reason: hierarchical.reasons.join("|"),
  };

  return {
    primary,
    secondary,
    semanticConfidence: Number(semanticConfidence.toFixed(2)),
    classificationTrace,
  };
}
