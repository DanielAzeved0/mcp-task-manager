import type { PromptSpec } from "../../schemas/promptSpec.js";
import type { SpecTemplate } from "../templates/registry.js";
import { logEvent, type TraceContext } from "../../observability/logger.js";
import { incrementMetric } from "../../observability/metrics.js";
import { validateLlmContentContract } from "./contractValidator.js";

export class SchemaAuthorityError extends Error {
  constructor(message: string, public readonly violations: string[]) {
    super(message);
  }
}

export function enforceSchemaAuthority(
  parsed: unknown,
  template: SpecTemplate,
  trace?: TraceContext,
): Record<string, unknown> {
  const validation = validateLlmContentContract(parsed, template);
  if (!validation.valid) {
    incrementMetric("contract_violation_rate");
    incrementMetric("strict_rejection_count");
    if (validation.violations.some((violation) => violation.type === "forbidden_key_detected")) {
      incrementMetric("schema_override_attempts");
    }
    for (const violation of validation.violations) {
      if (violation.type === "forbidden_key_detected") {
        logEvent("warn", "forbidden_key_stripped", { key: violation.key }, trace);
      }
    }
    logEvent("error", "contract_violation_detected", {
      violations: validation.violations,
      template_id: template.id,
    }, trace);
    throw new SchemaAuthorityError(
      `LLM attempted to violate schema authority: ${validation.violations.map((violation) => violation.message).join("; ")}`,
      validation.violations.map((violation) => violation.type),
    );
  }

  logEvent("info", "schema_authority_enforced", { template_id: template.id }, trace);
  return (parsed as { content: Record<string, unknown> }).content;
}

export function assertSystemOwnedStructure(spec: PromptSpec, template: SpecTemplate): void {
  const inputKeys = Object.keys(spec.input_fields).sort();
  const outputKeys = Object.keys(spec.output_fields).sort();
  const templateInputs = [...template.inputs].sort();
  const templateOutputs = [...template.outputs].sort();

  const structureMatches =
    inputKeys.every((key) => templateInputs.includes(key)) &&
    outputKeys.every((key) => templateOutputs.includes(key));

  if (!structureMatches) {
    throw new SchemaAuthorityError("Final PromptSpec diverged from selected template contract.", ["schema_divergence"]);
  }
}
