import type { SpecTemplate } from "../templates/registry.js";

export type ContractViolationType =
  | "forbidden_key_detected"
  | "missing_required_content"
  | "extra_content_key"
  | "content_not_object";

export interface ContractValidationResult {
  valid: boolean;
  violations: Array<{
    type: ContractViolationType;
    key?: string;
    message: string;
  }>;
}

const FORBIDDEN_ROOT_KEYS = new Set([
  "intent",
  "required_inputs",
  "required_outputs",
  "suggested_template",
  "risk_level",
  "quality_constraints",
  "schema",
  "structure",
  "task_instruction",
  "input_fields",
  "output_fields",
  "prompt_spec",
]);

export function validateLlmContentContract(value: unknown, template: SpecTemplate): ContractValidationResult {
  const violations: ContractValidationResult["violations"] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      valid: false,
      violations: [{ type: "content_not_object", message: "LLM response root must be an object." }],
    };
  }

  const root = value as Record<string, unknown>;
  for (const key of Object.keys(root)) {
    if (FORBIDDEN_ROOT_KEYS.has(key)) {
      violations.push({ type: "forbidden_key_detected", key, message: `Forbidden root key returned by LLM: ${key}` });
    }
  }

  if (!("content" in root) || !root.content || typeof root.content !== "object" || Array.isArray(root.content)) {
    violations.push({ type: "missing_required_content", key: "content", message: "LLM response must include content object." });
    return { valid: false, violations };
  }

  const content = root.content as Record<string, unknown>;
  for (const key of Object.keys(content)) {
    if (!template.outputs.includes(key)) {
      violations.push({ type: "extra_content_key", key, message: `Content key is not part of selected template: ${key}` });
    }
  }

  return { valid: violations.length === 0, violations };
}
