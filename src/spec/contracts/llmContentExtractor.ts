import type { PromptSpec } from "../../schemas/promptSpec.js";
import type { SpecTemplate } from "../templates/registry.js";
import { logEvent, type TraceContext } from "../../observability/logger.js";

function summarizeContent(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("; ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (value === undefined || value === null) return undefined;
  return String(value);
}

export function injectLlmContentIntoSpec(
  baseSpec: PromptSpec,
  template: SpecTemplate,
  content: Record<string, unknown>,
  trace?: TraceContext,
): PromptSpec {
  const next: PromptSpec = structuredClone(baseSpec);
  const injectedFields: string[] = [];

  for (const outputField of template.outputs) {
    const summary = summarizeContent(content[outputField]);
    if (!summary) continue;
    const field = next.output_fields[outputField];
    if (!field) continue;
    field.description = `${field.description} Content guidance: ${summary}`;
    injectedFields.push(outputField);
  }

  logEvent("info", "llm_content_injected", {
    template_id: template.id,
    injected_fields: injectedFields,
  }, trace);

  return next;
}
