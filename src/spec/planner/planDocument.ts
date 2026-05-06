import type { RiskLevel } from "../../ai/router/semanticClassifier.js";
import type { TemplateId } from "../templates/registry.js";

export interface PlanDocument {
  intent: string;
  required_inputs: string[];
  required_outputs: string[];
  risk_level: RiskLevel;
  quality_constraints: string[];
  suggested_template: TemplateId;
}

export function createDeterministicPlan(input: {
  intent: string;
  requiredInputs: string[];
  requiredOutputs: string[];
  riskLevel: RiskLevel;
  suggestedTemplate: TemplateId;
}): PlanDocument {
  return {
    intent: input.intent,
    required_inputs: input.requiredInputs,
    required_outputs: input.requiredOutputs,
    risk_level: input.riskLevel,
    quality_constraints: [
      "schema_owned_by_system",
      "canonical_fields_preserved",
      "outputs_validated",
      "no_ai_defined_contracts",
    ],
    suggested_template: input.suggestedTemplate,
  };
}

export function parsePlanDocument(raw: unknown, fallback: PlanDocument): PlanDocument {
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<PlanDocument>;

  return {
    intent: typeof value.intent === "string" ? value.intent : fallback.intent,
    required_inputs: Array.isArray(value.required_inputs) ? value.required_inputs.filter((item): item is string => typeof item === "string") : fallback.required_inputs,
    required_outputs: Array.isArray(value.required_outputs) ? value.required_outputs.filter((item): item is string => typeof item === "string") : fallback.required_outputs,
    risk_level: value.risk_level ?? fallback.risk_level,
    quality_constraints: Array.isArray(value.quality_constraints) ? value.quality_constraints.filter((item): item is string => typeof item === "string") : fallback.quality_constraints,
    suggested_template: value.suggested_template ?? fallback.suggested_template,
  };
}
