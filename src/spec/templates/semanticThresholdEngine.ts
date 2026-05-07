import type { ClassificationResult } from "../../ai/router/semanticClassifier.js";
import type { IntentMatch } from "../../ai/classifier/intentSimilarityEngine.js";

export const SEMANTIC_THRESHOLDS = {
  minimumSecondarySimilarity: 0.65,
  minimumSemanticConfidence: 0.72,
  maximumIntentDistance: 0.12,
};

export function validateSemanticThresholds(
  classification: ClassificationResult,
  ranked: IntentMatch[],
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (classification.confidence < SEMANTIC_THRESHOLDS.minimumSemanticConfidence) {
    issues.push(`semantic_confidence:${classification.confidence}`);
  }

  const primary = ranked[0];
  for (const secondary of ranked.slice(1, 4)) {
    const distance = Math.abs((primary?.similarity ?? 0) - secondary.similarity);
    if (secondary.similarity >= SEMANTIC_THRESHOLDS.minimumSecondarySimilarity && distance > SEMANTIC_THRESHOLDS.maximumIntentDistance) {
      issues.push(`intent_distance:${secondary.intent}:${distance.toFixed(4)}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

