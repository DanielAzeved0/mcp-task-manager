import { cosineSimilarity } from "../../cache/embeddings/cosineSimilarity.js";
import { createEmbeddingProvider } from "../../cache/embeddings/embeddingProvider.js";
import { INTENT_CATALOG, type IntentDefinition } from "./intentCatalog.js";

export interface IntentMatch {
  intent: IntentDefinition["intent"];
  similarity: number;
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

export function rankSemanticIntents(prompt: string): IntentMatch[] {
  const promptVector = embeddingProvider.embed(prompt);
  return intentVectors
    .map(({ intent, vector }) => ({
      intent: intent.intent,
      similarity: Number(cosineSimilarity(promptVector, vector).toFixed(4)),
      riskBias: intent.riskBias,
    }))
    .sort((a, b) => b.similarity - a.similarity);
}
