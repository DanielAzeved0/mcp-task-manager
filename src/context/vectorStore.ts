import { cosineSimilarity } from "../cache/embeddings/cosineSimilarity.js";
import { createEmbeddingProvider } from "../cache/embeddings/embeddingProvider.js";
import type { ContextChunk } from "./chunker.js";

export interface VectorStoreEntry {
  chunk: ContextChunk;
  embedding: number[];
}

export interface VectorSearchResult {
  chunk: ContextChunk;
  score: number;
}

export class InMemoryVectorStore {
  private readonly embeddingProvider = createEmbeddingProvider();
  private readonly entries: VectorStoreEntry[] = [];

  add(chunk: ContextChunk): void {
    this.entries.push({
      chunk,
      embedding: this.embeddingProvider.embed(chunk.text),
    });
  }

  addMany(chunks: ContextChunk[]): void {
    for (const chunk of chunks) this.add(chunk);
  }

  search(query: string, limit = 8): VectorSearchResult[] {
    const queryEmbedding = this.embeddingProvider.embed(query);
    return this.entries
      .map((entry) => ({
        chunk: entry.chunk,
        score: cosineSimilarity(queryEmbedding, entry.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
