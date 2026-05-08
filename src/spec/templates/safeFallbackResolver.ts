import { selectTemplate, type SpecTemplate } from "./registry.js";
import type { ClassificationResult } from "../../ai/router/semanticClassifier.js";
import { validateSpecSafety } from "../../governance/safety/safetyEngine.js";

export type FallbackReason =
  | "provider_api_key_invalid"
  | "provider_model_deprecated"
  | "provider_quota_exceeded"
  | "provider_timeout"
  | "provider_health_invalid"
  | "low_confidence"
  | "schema_validation_failed"
  | "no_candidate_backend";

export interface SafeFallbackResolution {
  template: SpecTemplate;
  fallbackType: "intent_specific" | "generic";
  selectedFallbackTemplate: string;
  fallbackReason: FallbackReason;
  warnings: string[];
}

export function resolveSafeFallbackTemplate(classification?: ClassificationResult, fallbackReason: FallbackReason = "no_candidate_backend"): SafeFallbackResolution {
  const warnings: string[] = [];
  const general = selectTemplate("general_spec");
  const neverDefaultTo = new Set(["api_design", "database_design", "architecture_design"]);

  if (!classification || !classification.semantic_intent || classification.confidence < 0.72) {
    warnings.push("degraded_confidence");
    return { template: general, fallbackType: "generic", selectedFallbackTemplate: general.id, fallbackReason, warnings };
  }

  const candidate = selectTemplate(classification.semantic_intent);
  if (neverDefaultTo.has(candidate.id)) {
    warnings.push(`fallback_template_redirected:${candidate.id}->${general.id}`);
    return { template: general, fallbackType: "generic", selectedFallbackTemplate: general.id, fallbackReason, warnings };
  }
  if (candidate.id === "general_spec") {
    warnings.push("missing_intent_template");
    return { template: general, fallbackType: "generic", selectedFallbackTemplate: general.id, fallbackReason, warnings };
  }

  const safety = validateSpecSafety(candidate.contract);
  if (!safety.allowed) {
    warnings.push(...safety.issues);
    return { template: general, fallbackType: "generic", selectedFallbackTemplate: general.id, fallbackReason, warnings };
  }

  return {
    template: candidate,
    fallbackType: "intent_specific",
    selectedFallbackTemplate: candidate.id,
    fallbackReason,
    warnings,
  };
}
