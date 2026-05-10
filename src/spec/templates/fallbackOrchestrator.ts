import { classifyProviderError } from "../../governance/providers/providerErrorTaxonomy.js";
import type { FallbackReason } from "./safeFallbackResolver.js";

export function resolveFallbackReason(lastError: string, candidates: unknown[]): FallbackReason {
  if (!lastError.trim()) return "no_candidate_backend";
  if (candidates.length === 0) return "no_candidate_backend";

  const errorClassification = classifyProviderError(lastError);
  if (errorClassification.type === "model_deprecated") return "provider_model_deprecated";
  if (errorClassification.type === "quota_exceeded") return "provider_quota_exceeded";
  if (errorClassification.type === "auth_error") return "provider_api_key_invalid";
  if (errorClassification.type === "timeout") return "provider_timeout";
  if (errorClassification.type === "health_error") return "provider_health_invalid";
  if (errorClassification.type === "malformed_response") return "schema_validation_failed";

  const normalized = lastError.toLowerCase();
  if (normalized.includes("timed out")) return "provider_timeout";
  if (normalized.includes("health")) return "provider_health_invalid";
  if (normalized.includes("confidence")) return "low_confidence";
  if (normalized.includes("validation") || normalized.includes("schema") || normalized.includes("json")) return "schema_validation_failed";
  if (normalized.includes("api key") || normalized.includes("unauthorized") || normalized.includes("permission")) return "provider_api_key_invalid";

  return "schema_validation_failed";
}
