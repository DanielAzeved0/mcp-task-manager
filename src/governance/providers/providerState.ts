import type { ProviderName } from "./providerRegistry.js";
import { classifyProviderError, type ProviderErrorType } from "./providerErrorTaxonomy.js";
import { getProviderHealth } from "./providerGovernance.js";

export interface ProviderCapabilityState {
  provider: ProviderName;
  auth: "valid" | "invalid" | "unknown";
  quota: "available" | "exhausted" | "unknown";
  model: "available" | "deprecated" | "unknown";
  network: "healthy" | "degraded" | "unknown";
  reliability: number;
  last_error_type: ProviderErrorType | "none";
}

const providerStates = new Map<ProviderName, ProviderCapabilityState>();

function initial(provider: ProviderName): ProviderCapabilityState {
  return {
    provider,
    auth: provider === "gemini" ? (process.env.GEMINI_API_KEY ? "valid" : "unknown") : "unknown",
    quota: "unknown",
    model: "unknown",
    network: "unknown",
    reliability: getProviderHealth(provider).reliability,
    last_error_type: "none",
  };
}

export function getProviderState(provider: ProviderName): ProviderCapabilityState {
  const current = providerStates.get(provider) ?? initial(provider);
  return {
    ...current,
    reliability: getProviderHealth(provider).reliability,
  };
}

export function markProviderModelAvailable(provider: ProviderName): ProviderCapabilityState {
  const next = { ...getProviderState(provider), model: "available" as const, last_error_type: "none" as const };
  providerStates.set(provider, next);
  return next;
}

export function updateProviderStateFromError(provider: ProviderName, error: unknown): ProviderCapabilityState {
  const classification = classifyProviderError(error);
  const current = getProviderState(provider);
  const next: ProviderCapabilityState = {
    ...current,
    last_error_type: classification.type,
  };

  if (classification.type === "model_deprecated") next.model = "deprecated";
  if (classification.type === "quota_exceeded") next.quota = "exhausted";
  if (classification.type === "auth_error") next.auth = "invalid";
  if (classification.type === "timeout" || classification.type === "health_error") next.network = "degraded";
  if (classification.type === "malformed_response") next.network = "healthy";

  providerStates.set(provider, next);
  return next;
}

export function getAllProviderStates(): Record<ProviderName, ProviderCapabilityState> {
  return {
    gemini: getProviderState("gemini"),
    llama: getProviderState("llama"),
  };
}
