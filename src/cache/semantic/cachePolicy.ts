export interface SemanticCacheDecisionInput {
  provider: string;
  fallbackUsed: boolean;
  semanticPrecisionScore: number;
  intentMatchScore: number;
}

export function shouldWriteSemanticCache(input: SemanticCacheDecisionInput): boolean {
  return (
    !input.fallbackUsed &&
    ["gemini", "llama"].includes(input.provider) &&
    input.semanticPrecisionScore >= 8 &&
    input.intentMatchScore >= 8
  );
}
