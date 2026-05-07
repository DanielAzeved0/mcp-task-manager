import type { ClassificationResult } from "../../ai/router/semanticClassifier.js";
import type { IntentMatch } from "../../ai/classifier/intentSimilarityEngine.js";

const ALLOWED_COMPOSITIONS: Record<string, string[]> = {
  security_analysis: ["observability_analysis", "api_design", "code_analysis"],
  code_analysis: ["testing_strategy", "security_analysis"],
  frontend_component: ["accessibility_analysis"],
};

const BLOCKED_COMPOSITIONS: Record<string, string[]> = {
  security_analysis: ["frontend_component"],
  code_analysis: ["api_design", "database_design", "frontend_component", "migration_strategy"],
  frontend_component: ["database_design", "migration_strategy", "security_analysis"],
};

export function validateIntentCompatibility(
  classification: ClassificationResult,
  ranked: IntentMatch[],
  thresholds: { minimumSecondarySimilarity: number; maximumIntentDistance: number },
): { accepted: IntentMatch[]; rejected: string[] } {
  const primaryIntent = classification.semantic_intent;
  const primary = ranked.find((match) => match.intent === primaryIntent) ?? ranked[0];
  const allowed = ALLOWED_COMPOSITIONS[primaryIntent] ?? [];
  const blocked = BLOCKED_COMPOSITIONS[primaryIntent] ?? [];
  const rejected: string[] = [];
  const accepted: IntentMatch[] = [];

  for (const match of ranked) {
    if (match.intent === primaryIntent) {
      accepted.push(match);
      continue;
    }

    if (blocked.includes(match.intent)) {
      rejected.push(`blocked:${primaryIntent}->${match.intent}`);
      continue;
    }

    const intentDistance = Math.abs((primary?.similarity ?? 0) - match.similarity);
    if (match.similarity < thresholds.minimumSecondarySimilarity) {
      rejected.push(`low_similarity:${match.intent}:${match.similarity}`);
      continue;
    }

    if (intentDistance > thresholds.maximumIntentDistance) {
      rejected.push(`intent_distance:${match.intent}:${intentDistance.toFixed(4)}`);
      continue;
    }

    if (allowed.length > 0 && !allowed.includes(match.intent)) {
      rejected.push(`not_allowed:${primaryIntent}->${match.intent}`);
      continue;
    }

    accepted.push(match);
  }

  return { accepted, rejected };
}
