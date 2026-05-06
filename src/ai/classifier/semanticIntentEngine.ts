import { rankSemanticIntents, type IntentMatch } from "./intentSimilarityEngine.js";

export interface SemanticIntentResult {
  primary: IntentMatch;
  secondary: IntentMatch[];
  semanticConfidence: number;
}

export function analyzeSemanticIntent(prompt: string): SemanticIntentResult {
  const ranked = rankSemanticIntents(prompt);
  const primary = ranked[0] ?? { intent: "general_spec", similarity: 0, riskBias: 0 };
  const secondary = ranked.slice(1, 4).filter((match) => match.similarity >= Math.max(0.12, primary.similarity * 0.5));
  const separation = primary.similarity - (ranked[1]?.similarity ?? 0);
  const semanticConfidence = Math.max(0.45, Math.min(0.95, 0.55 + primary.similarity * 0.35 + separation * 0.25));

  return {
    primary,
    secondary,
    semanticConfidence: Number(semanticConfidence.toFixed(2)),
  };
}
