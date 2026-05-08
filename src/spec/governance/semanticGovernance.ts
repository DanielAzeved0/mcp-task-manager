import type { SpecTemplate } from "../templates/registry.js";
import { logEvent, type TraceContext } from "../../observability/logger.js";
import { incrementMetric } from "../../observability/metrics.js";

export type SemanticGovernanceErrorCode = "missing_required_input" | "semantic_violation" | "strict_output_violation";

export class SemanticGovernanceError extends Error {
  constructor(
    public readonly errorCode: SemanticGovernanceErrorCode,
    message: string,
    public readonly intent: string,
    public readonly requiredFields: string[] = [],
  ) {
    super(message);
  }
}

const REQUIRED_INPUTS: Record<string, { fields: string[]; message: string }> = {
  code_analysis: {
    fields: ["code"],
    message: "Field 'code' is mandatory for code_analysis intent.",
  },
  code_refactor: {
    fields: ["code"],
    message: "Field 'code' is mandatory for code_refactor intent.",
  },
  api_design: {
    fields: ["resource", "operations"],
    message: "API design requires 'resource' and 'operations'.",
  },
};

const GENERIC_CODE_ANALYSIS_PATTERNS = [
  "potencial para",
  "apos refatoracao",
  "após refatoração",
  "a ser determinado",
  "pode melhorar",
  "base funcional existente",
  "no code provided",
  "cannot analyze without",
  "nao e possivel identificar",
  "não é possível identificar",
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

export function validateContextualInputs(intent: string, inputs: Record<string, unknown> = {}, trace?: TraceContext): void {
  const rule = REQUIRED_INPUTS[intent];
  if (!rule) return;

  const missing = rule.fields.filter((field) => !hasValue(inputs[field]));
  if (missing.length === 0) return;

  incrementMetric("input_missing_errors_total");
  logEvent("warn", "contextual_input_missing", { intent, required_fields: rule.fields, missing_fields: missing }, trace);
  throw new SemanticGovernanceError("missing_required_input", rule.message, intent, rule.fields);
}

function containsGenericPattern(value: unknown): boolean {
  const text = normalize(JSON.stringify(value ?? ""));
  return GENERIC_CODE_ANALYSIS_PATTERNS.some((pattern) => text.includes(normalize(pattern)));
}

function validateEvidenceArray(value: unknown, field: string, intent: string): void {
  if (!Array.isArray(value)) {
    throw new SemanticGovernanceError("strict_output_violation", `Field '${field}' must be an array.`, intent, [field]);
  }

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !hasValue((item as Record<string, unknown>).evidence)) {
      throw new SemanticGovernanceError("semantic_violation", "Generic or hypothetical content detected. Concrete evidence required.", intent, [field]);
    }
  }
}

export function validateSemanticContent(intent: string, content: Record<string, unknown>, trace?: TraceContext): void {
  if (containsGenericPattern(content)) {
    incrementMetric("semantic_rejections_total");
    logEvent("warn", "semantic_violation_detected", { intent, reason: "generic_pattern" }, trace);
    throw new SemanticGovernanceError("semantic_violation", "Generic or hypothetical content detected. Concrete evidence required.", intent);
  }

  if (intent === "code_analysis") {
    for (const field of ["strengths", "weaknesses"]) {
      validateEvidenceArray(content[field], field, intent);
    }
  }
}

export function validateStrictOutputTypes(template: SpecTemplate, content: Record<string, unknown>, trace?: TraceContext): void {
  for (const [fieldName, fieldSchema] of Object.entries(template.contract.output_fields)) {
    if (!(fieldName in content)) continue;
    const value = content[fieldName];
    const expectedType = fieldSchema.type;
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (expectedType === "array" && !Array.isArray(value)) {
      incrementMetric("semantic_rejections_total");
      logEvent("warn", "semantic_violation_detected", { intent: template.id, field: fieldName, expected_type: "array", actual_type: actualType }, trace);
      throw new SemanticGovernanceError("strict_output_violation", `Field '${fieldName}' must be an array.`, template.id, [fieldName]);
    }
    if (expectedType === "object" && (!value || typeof value !== "object" || Array.isArray(value))) {
      incrementMetric("semantic_rejections_total");
      logEvent("warn", "semantic_violation_detected", { intent: template.id, field: fieldName, expected_type: "object", actual_type: actualType }, trace);
      throw new SemanticGovernanceError("strict_output_violation", `Field '${fieldName}' must be an object.`, template.id, [fieldName]);
    }
    if (expectedType === "number" && typeof value !== "number") {
      incrementMetric("semantic_rejections_total");
      logEvent("warn", "semantic_violation_detected", { intent: template.id, field: fieldName, expected_type: "number", actual_type: actualType }, trace);
      throw new SemanticGovernanceError("strict_output_violation", `Field '${fieldName}' must be a number.`, template.id, [fieldName]);
    }
  }
}

export function shouldBlockHeuristicFieldInference(prompt: string): boolean {
  const normalized = normalize(prompt);
  const forbiddenTriggerTerms = ["quero", "preciso", "faca", "faça", "me de", "me dê", "poderia", "gostaria"];
  return forbiddenTriggerTerms.some((term) => normalized.includes(normalize(term)));
}
