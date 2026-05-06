import type { PromptSpec } from "../../schemas/promptSpec.js";
import type { PlanDocument } from "../planner/planDocument.js";
import { compileSpecDsl, type SpecDsl } from "../dsl/specDsl.js";
import { selectTemplate, type SpecTemplate } from "../templates/registry.js";

export function buildDslFromPlan(plan: PlanDocument): SpecDsl {
  const template = selectTemplate(plan.suggested_template);
  return {
    version: template.version,
    intent: template.id,
    inputs: plan.required_inputs.length ? plan.required_inputs : template.inputs,
    outputs: plan.required_outputs.length ? plan.required_outputs : template.outputs,
  };
}

export function buildSpecFromPlan(plan: PlanDocument, prompt: string): PromptSpec {
  const spec = compileSpecDsl(buildDslFromPlan(plan));
  return {
    ...spec,
    task_instruction: `${spec.task_instruction} Source request: ${prompt.trim()}`,
  };
}

export function buildSpecFromTemplate(template: SpecTemplate, prompt: string, inputFields = template.inputs, outputFields = template.outputs): PromptSpec {
  const contract = structuredClone(template.contract);
  contract.input_fields = Object.fromEntries(
    Object.entries(contract.input_fields).filter(([field]) => inputFields.includes(field))
  );
  contract.output_fields = Object.fromEntries(
    Object.entries(contract.output_fields).filter(([field]) => outputFields.includes(field))
  );

  if (Object.keys(contract.input_fields).length === 0) contract.input_fields = template.contract.input_fields;
  if (Object.keys(contract.output_fields).length === 0) contract.output_fields = template.contract.output_fields;

  return {
    ...contract,
    task_instruction: `${contract.task_instruction} Source request: ${prompt.trim()}`,
  };
}
