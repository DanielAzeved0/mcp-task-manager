import { cosineSimilarity } from "../embeddings/cosineSimilarity.js";
import { createEmbeddingProvider } from "../embeddings/embeddingProvider.js";

export interface SemanticCacheEntry<T> {
  key: string;
  prompt: string;
  embedding: number[];
  value: T;
  created_at: string;
}

export interface SemanticCacheHit<T> {
  entry: SemanticCacheEntry<T>;
  similarity: number;
}

const embeddingProvider = createEmbeddingProvider();

export class SemanticCache<T> {
  private entries: SemanticCacheEntry<T>[] = [];

  constructor(private readonly similarityMinimum = 0.9) {}

  get(prompt: string): SemanticCacheHit<T> | null {
    const target = embeddingProvider.embed(prompt);
    let best: SemanticCacheHit<T> | null = null;

    for (const entry of this.entries) {
      const similarity = cosineSimilarity(target, entry.embedding);
      if (similarity >= this.similarityMinimum && (!best || similarity > best.similarity)) {
        best = { entry, similarity };
      }
    }

    return best;
  }

  set(key: string, prompt: string, value: T): void {
    this.entries.push({
      key,
      prompt,
      embedding: embeddingProvider.embed(prompt),
      value,
      created_at: new Date().toISOString(),
    });
  }
}
