export type ProviderName = "llama" | "gemini";

export interface ProviderModelEntry {
  provider: ProviderName;
  model: string;
  capabilities: string[];
  enabled: boolean;
  priority: number;
  deprecated?: boolean;
}

export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

export const PROVIDER_MODELS: ProviderModelEntry[] = [
  {
    provider: "gemini",
    model: "gemini-2.5-flash",
    capabilities: ["planning", "reasoning", "json_generation", "spec_generation"],
    enabled: true,
    priority: 12,
  },
  {
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    capabilities: ["planning", "json_generation", "spec_generation"],
    enabled: true,
    priority: 11,
  },
  {
    provider: "gemini",
    model: "gemini-2.0-flash",
    capabilities: ["planning", "reasoning", "json_generation", "spec_generation"],
    enabled: false,
    priority: 10,
    deprecated: true,
  },
  {
    provider: "gemini",
    model: "gemini-1.5-pro",
    capabilities: ["deep_reasoning", "architecture_planning", "json_generation", "spec_generation"],
    enabled: true,
    priority: 9,
  },
  {
    provider: "gemini",
    model: "gemini-1.5-flash",
    capabilities: ["planning", "json_generation", "spec_generation"],
    enabled: true,
    priority: 8,
  },
];

export function getGeminiModelCandidates(configuredModel?: string): string[] {
  const preferred = PROVIDER_MODELS
    .filter((entry) => entry.provider === "gemini")
    .sort((a, b) => b.priority - a.priority)
    .map((entry) => entry.model);
  return [...new Set([configuredModel, ...preferred].filter(Boolean) as string[])];
}

export function validateProviderModel(
  provider: ProviderName,
  model: string,
  requiredCapabilities: string[] = [],
): { valid: boolean; resolvedModel?: string; issues: string[] } {
  if (provider !== "gemini") {
    return { valid: true, resolvedModel: model, issues: [] };
  }

  const entry = PROVIDER_MODELS.find((candidate) => candidate.provider === provider && candidate.model === model);
  if (!entry) {
    return {
      valid: false,
      issues: [`Provider model invalid: ${provider}/${model}`],
    };
  }

  if (!entry.enabled) {
    return {
      valid: false,
      issues: [entry.deprecated
        ? `Provider model deprecated: ${provider}/${model} is no longer available`
        : `Provider model disabled: ${provider}/${model}`],
    };
  }

  const missingCapabilities = requiredCapabilities.filter((capability) => !entry.capabilities.includes(capability));
  if (missingCapabilities.length > 0) {
    return {
      valid: false,
      issues: [`Provider model missing capabilities: ${missingCapabilities.join(", ")}`],
    };
  }

  return { valid: true, resolvedModel: entry.model, issues: [] };
}

export function validateProviderHealth(
  provider: ProviderName,
  reliability: number,
  minimumReliability = 0.2,
): { valid: boolean; issues: string[] } {
  if (reliability < minimumReliability) {
    return {
      valid: false,
      issues: [`Provider health below threshold: ${provider} reliability ${reliability}`],
    };
  }

  return { valid: true, issues: [] };
}
