import type { PromptSpec } from "../../schemas/promptSpec.js";
import { selectTemplate, type TemplateId } from "../templates/registry.js";

export interface SpecDsl {
  version: string;
  intent: TemplateId;
  inputs: string[];
  outputs: string[];
}

export function parseSpecDsl(raw: unknown): SpecDsl {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid Spec DSL: expected object");
  }

  const value = raw as Partial<SpecDsl>;
  if (!value.intent || !Array.isArray(value.inputs) || !Array.isArray(value.outputs)) {
    throw new Error("Invalid Spec DSL: missing intent, inputs, or outputs");
  }

  return {
    version: value.version ?? "1.0.0",
    intent: value.intent,
    inputs: value.inputs,
    outputs: value.outputs,
  };
}

export function compileSpecDsl(dsl: SpecDsl): PromptSpec {
  const template = selectTemplate(dsl.intent);
  const contract = structuredClone(template.contract);

  contract.input_fields = Object.fromEntries(
    Object.entries(contract.input_fields).filter(([field]) => dsl.inputs.includes(field))
  );

  contract.output_fields = Object.fromEntries(
    Object.entries(contract.output_fields).filter(([field]) => dsl.outputs.includes(field))
  );

  if (Object.keys(contract.input_fields).length === 0) {
    contract.input_fields = template.contract.input_fields;
  }
  if (Object.keys(contract.output_fields).length === 0) {
    contract.output_fields = template.contract.output_fields;
  }

  return contract;
}
