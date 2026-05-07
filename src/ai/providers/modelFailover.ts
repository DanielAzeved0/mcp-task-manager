import { getGeminiModelCandidates } from "../../governance/providers/providerRegistry.js";
import type { ProviderErrorClassification } from "../../governance/providers/providerErrorTaxonomy.js";

export interface ModelFailoverEvent {
  provider: "gemini";
  model: string;
  error_type?: ProviderErrorClassification["type"];
  action: "attempt" | "try_next_model" | "selected" | "exhausted";
}

export function buildGeminiModelFailoverChain(configuredModel?: string): string[] {
  return getGeminiModelCandidates(configuredModel);
}

export function shouldTryNextGeminiModel(error: ProviderErrorClassification): boolean {
  return error.type === "model_deprecated";
}
