import type { PromptSpec } from "../../schemas/promptSpec.js";
import type { ClassificationResult } from "../../ai/router/semanticClassifier.js";
import { rankSemanticIntents } from "../../ai/classifier/intentSimilarityEngine.js";
import { selectTemplate, type SpecTemplate } from "./registry.js";

export interface TemplateComposition {
  templates: SpecTemplate[];
  composed: SpecTemplate;
  conflicts: string[];
}

function mergeContracts(templates: SpecTemplate[]): { contract: PromptSpec; conflicts: string[] } {
  const [primary, ...rest] = templates;
  const contract: PromptSpec = structuredClone(primary.contract);
  const conflicts: string[] = [];

  for (const template of rest) {
    for (const [field, definition] of Object.entries(template.contract.input_fields)) {
      const existing = contract.input_fields[field];
      if (existing && existing.type !== definition.type) {
        conflicts.push(`input.${field}`);
        continue;
      }
      contract.input_fields[field] = existing ?? definition;
    }

    for (const [field, definition] of Object.entries(template.contract.output_fields)) {
      const existing = contract.output_fields[field];
      if (existing && existing.type !== definition.type) {
        conflicts.push(`output.${field}`);
        continue;
      }
      contract.output_fields[field] = existing ?? definition;
    }
  }

  contract.task_instruction = templates.map((template) => template.contract.task_instruction).join(" ");
  return { contract, conflicts };
}

export function resolveTemplateComposition(prompt: string, classification: ClassificationResult): TemplateComposition {
  const ranked = rankSemanticIntents(prompt);
  const selectedIds = new Set([
    classification.semantic_intent,
    ...ranked.filter((match) => match.similarity >= Math.max(0.3, ranked[0]?.similarity * 0.5)).slice(0, 4).map((match) => match.intent),
  ]);

  const templates = [...selectedIds].map((intent) => selectTemplate(intent));
  const uniqueTemplates = templates.filter((template, index, list) => list.findIndex((candidate) => candidate.id === template.id) === index);
  const { contract, conflicts } = mergeContracts(uniqueTemplates);

  return {
    templates: uniqueTemplates,
    conflicts,
    composed: {
      id: uniqueTemplates[0]?.id ?? "general_spec",
      version: uniqueTemplates.map((template) => `${template.id}@${template.version}`).join("+"),
      intents: uniqueTemplates.flatMap((template) => template.intents),
      inputs: Object.keys(contract.input_fields),
      outputs: Object.keys(contract.output_fields),
      contract,
    },
  };
}
