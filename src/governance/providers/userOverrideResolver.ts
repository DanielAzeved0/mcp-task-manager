import type { ExecutionPolicy } from "../policies/policyEngine.js";
import type { ClassificationResult } from "../../ai/router/semanticClassifier.js";

export type BackendPreference = "llama" | "ollama" | "gemini" | "auto";

export function resolveUserOverride(
  preferredBackend: string,
  classification: ClassificationResult,
  policy: ExecutionPolicy,
): { provider: "llama" | "gemini"; manualOverride: boolean; warnings: string[] } {
  const normalized = (preferredBackend || "auto").toLowerCase() as BackendPreference;
  if (normalized === "gemini") {
    return {
      provider: "gemini",
      manualOverride: true,
      warnings: policy.provider !== "gemini" ? [`Manual override selected gemini over policy ${policy.provider}`] : [],
    };
  }

  if (normalized === "llama" || normalized === "ollama") {
    return {
      provider: "llama",
      manualOverride: true,
      warnings: policy.disableLlama
        ? [`Manual override selected llama for ${classification.risk_level} risk; governance warning logged but not rerouted`]
        : [],
    };
  }

  return {
    provider: policy.provider,
    manualOverride: false,
    warnings: [],
  };
}

