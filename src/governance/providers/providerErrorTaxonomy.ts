export type ProviderErrorType =
  | "model_deprecated"
  | "quota_exceeded"
  | "auth_error"
  | "timeout"
  | "malformed_response"
  | "health_error"
  | "unknown";

export interface ProviderErrorClassification {
  type: ProviderErrorType;
  affectsReliability: boolean;
  action: "try_next_model" | "mark_quota_exhausted" | "mark_auth_invalid" | "retry_or_fallback" | "retry_with_stricter_prompt" | "mark_health_degraded";
}

function containsAll(message: string, terms: string[]): boolean {
  return terms.every((term) => message.includes(term.toLowerCase()));
}

function containsAny(message: string, terms: string[]): boolean {
  return terms.some((term) => message.includes(term.toLowerCase()));
}

export function classifyProviderError(error: unknown): ProviderErrorClassification {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();

  if (containsAll(message, ["model"]) && containsAny(message, ["no longer available", "not found", "404", "deprecated"])) {
    return { type: "model_deprecated", affectsReliability: false, action: "try_next_model" };
  }

  if (containsAny(message, ["quota", "too many requests", "spending cap", "rate limit", "429"])) {
    return { type: "quota_exceeded", affectsReliability: false, action: "mark_quota_exhausted" };
  }

  if (containsAny(message, ["api key not valid", "unauthorized", "permission", "401", "403"])) {
    return { type: "auth_error", affectsReliability: false, action: "mark_auth_invalid" };
  }

  if (containsAny(message, ["timed out", "timeout"])) {
    return { type: "timeout", affectsReliability: true, action: "retry_or_fallback" };
  }

  if (containsAny(message, ["invalid json", "schema validation failed", "malformed", "parse json", "extract json"])) {
    return { type: "malformed_response", affectsReliability: true, action: "retry_with_stricter_prompt" };
  }

  if (containsAny(message, ["health", "reliability"])) {
    return { type: "health_error", affectsReliability: true, action: "mark_health_degraded" };
  }

  return { type: "unknown", affectsReliability: true, action: "retry_or_fallback" };
}
