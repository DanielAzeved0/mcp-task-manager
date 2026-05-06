export interface ProviderHealth {
  provider: "llama" | "gemini" | "fallback" | "semantic_cache";
  reliability: number;
  failures: number;
  successes: number;
  averageLatencyMs: number;
}

const providerHealth = new Map<string, ProviderHealth>();

function initial(provider: ProviderHealth["provider"]): ProviderHealth {
  return {
    provider,
    reliability: provider === "fallback" ? 0.82 : 0.9,
    failures: 0,
    successes: 0,
    averageLatencyMs: 0,
  };
}

export function getProviderHealth(provider: ProviderHealth["provider"]): ProviderHealth {
  return providerHealth.get(provider) ?? initial(provider);
}

export function recordProviderResult(provider: ProviderHealth["provider"], success: boolean, latencyMs: number): ProviderHealth {
  const current = getProviderHealth(provider);
  const total = current.failures + current.successes + 1;
  const next: ProviderHealth = {
    ...current,
    failures: current.failures + (success ? 0 : 1),
    successes: current.successes + (success ? 1 : 0),
    averageLatencyMs: Number((((current.averageLatencyMs * (total - 1)) + latencyMs) / total).toFixed(1)),
  };
  next.reliability = Number((next.successes / Math.max(1, next.successes + next.failures)).toFixed(2));
  providerHealth.set(provider, next);
  return next;
}
