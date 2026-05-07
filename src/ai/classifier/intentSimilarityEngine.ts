import { cosineSimilarity } from "../../cache/embeddings/cosineSimilarity.js";
import { createEmbeddingProvider } from "../../cache/embeddings/embeddingProvider.js";
import { INTENT_CATALOG, type IntentDefinition } from "./intentCatalog.js";
import { applyIntentScoring, type ClassificationTrace } from "./classificationScoring.js";

export interface IntentMatch {
  intent: IntentDefinition["intent"];
  similarity: number;
  baseSimilarity: number;
  negativePenalty: number;
  boost: number;
  finalScore: number;
  riskBias: number;
}

const embeddingProvider = createEmbeddingProvider();

function intentText(intent: IntentDefinition): string {
  return `${intent.description} ${intent.examples.join(" ")}`;
}

const intentVectors = INTENT_CATALOG.map((intent) => ({
  intent,
  vector: embeddingProvider.embed(intentText(intent)),
}));

export function rankSemanticIntentsWithTrace(prompt: string): { matches: IntentMatch[]; trace: ClassificationTrace } {
  const promptVector = embeddingProvider.embed(prompt);
  const baseScores = Object.fromEntries(
    intentVectors.map(({ intent, vector }) => [
      intent.intent,
      Number(cosineSimilarity(promptVector, vector).toFixed(4)),
    ])
  );
  const trace = applyIntentScoring({
    prompt,
    definitions: INTENT_CATALOG,
    baseScores,
  });

  const matches = intentVectors
    .map(({ intent }) => ({
      intent: intent.intent,
      similarity: trace.final_scores[intent.intent] ?? 0,
      baseSimilarity: baseScores[intent.intent] ?? 0,
      negativePenalty: trace.negative_penalties[intent.intent] ?? 0,
      boost: trace.boosts[intent.intent] ?? 0,
      finalScore: trace.final_scores[intent.intent] ?? 0,
      riskBias: intent.riskBias,
    }))
    .sort((a, b) => b.similarity - a.similarity);

  return { matches, trace };
}

export function rankSemanticIntents(prompt: string): IntentMatch[] {
  return rankSemanticIntentsWithTrace(prompt).matches;
}
