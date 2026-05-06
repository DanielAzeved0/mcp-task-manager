import type { PromptSpec } from "../../schemas/promptSpec.js";

const UNSAFE_TERMS = ["api_key", "secret_key", "password=", "private_key", "token="];

export interface SafetyResult {
  allowed: boolean;
  issues: string[];
}

export function validateSpecSafety(spec: PromptSpec): SafetyResult {
  const serialized = JSON.stringify(spec).toLowerCase();
  const issues = UNSAFE_TERMS
    .filter((term) => serialized.includes(term))
    .map((term) => `Potential secret exposure pattern '${term}' detected`);

  return {
    allowed: issues.length === 0,
    issues,
  };
}
