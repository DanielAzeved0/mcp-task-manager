import type { ClassificationResult, RiskLevel } from "../../ai/router/semanticClassifier.js";

export interface ExecutionPolicy {
  provider: "llama" | "gemini";
  retries: number;
  minConfidence: number;
  validationPasses: number;
  disableLlama: boolean;
}

const POLICY_BY_PROMPT_TYPE: Record<ClassificationResult["prompt_type"], ExecutionPolicy> = {
  simple: { provider: "llama", retries: 1, minConfidence: 7, validationPasses: 1, disableLlama: false },
  medium: { provider: "llama", retries: 2, minConfidence: 8, validationPasses: 1, disableLlama: false },
  complex: { provider: "gemini", retries: 2, minConfidence: 8.3, validationPasses: 2, disableLlama: true },
  critical: { provider: "gemini", retries: 3, minConfidence: 8.8, validationPasses: 2, disableLlama: true },
};

export function resolveExecutionPolicy(classification: ClassificationResult): ExecutionPolicy {
  const base = POLICY_BY_PROMPT_TYPE[classification.prompt_type];
  if (classification.routing_recommendation === "gemini") {
    return {
      ...base,
      provider: "gemini",
      disableLlama: classification.risk_level !== "low",
      minConfidence: Math.max(base.minConfidence, classification.risk_level === "medium" ? 8.2 : base.minConfidence),
    };
  }
  if (classification.risk_level === "high" || classification.risk_level === "critical") {
    return {
      ...base,
      provider: "gemini",
      disableLlama: true,
      minConfidence: Math.max(base.minConfidence, classification.risk_level === "critical" ? 9 : 8.5),
    };
  }
  return base;
}

export function riskAllowsProvider(riskLevel: RiskLevel, provider: "llama" | "gemini"): boolean {
  if (provider === "gemini") return ["medium", "high", "critical"].includes(riskLevel) || riskLevel === "low";
  return riskLevel === "low" || riskLevel === "medium";
}
