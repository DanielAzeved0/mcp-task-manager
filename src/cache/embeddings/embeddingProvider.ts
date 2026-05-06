export type EmbeddingProviderName = "local-hash" | "gemini-embedding" | "bge-small" | "e5-small";

export interface EmbeddingProvider {
  name: EmbeddingProviderName;
  embed(text: string): number[];
}

const VECTOR_SIZE = 64;

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  const synonyms: Record<string, string> = {
    modify: "change",
    update: "change",
    background: "color",
    bg: "color",
    secure: "security",
    flaws: "vulnerabilities",
    flaw: "vulnerability",
    gateway: "api",
    telemetry: "observability",
  };

  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .replace(/-/g, " ");

  const words = normalized
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .map((token) => synonyms[token] ?? token);
  const bigrams = words.slice(0, -1).map((word, index) => `${word}_${words[index + 1]}`);
  return [...words, ...bigrams];
}

export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  name: EmbeddingProviderName = "local-hash";

  embed(text: string): number[] {
    const vector = Array.from({ length: VECTOR_SIZE }, () => 0);
    for (const token of tokenize(text)) {
      const hash = hashToken(token);
      const index = hash % VECTOR_SIZE;
      const sign = hash % 2 === 0 ? 1 : -1;
      vector[index] += sign;
    }
    return normalizeVector(vector);
  }
}

export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

export function createEmbeddingProvider(name: EmbeddingProviderName = "local-hash"): EmbeddingProvider {
  // Cloud/local model names are accepted for policy compatibility. Until those
  // providers are configured, deterministic local embeddings keep behavior stable.
  return new LocalHashEmbeddingProvider();
}
