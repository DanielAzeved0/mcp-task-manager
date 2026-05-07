import type { PromptSpec } from "../../schemas/promptSpec.js";
import type { ClassificationResult } from "../../ai/router/semanticClassifier.js";
import { rankSemanticIntents } from "../../ai/classifier/intentSimilarityEngine.js";
import { selectTemplate, type SpecTemplate, type TemplateId } from "./registry.js";
import { validateIntentCompatibility } from "./intentCompatibilityMatrix.js";
import { SEMANTIC_THRESHOLDS, validateSemanticThresholds } from "./semanticThresholdEngine.js";

const TEMPLATE_PRIORITIES: Record<string, number> = {
  security_analysis: 10,
  architecture_design: 8,
  api_design: 7,
  code_analysis: 6,
  frontend_component: 4,
};

export interface TemplateComposition {
  templates: SpecTemplate[];
  composed: SpecTemplate;
  conflicts: string[];
  rejections: string[];
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
  const semanticValidation = validateSemanticThresholds(classification, ranked);
  const compatibility = validateIntentCompatibility(classification, ranked.slice(0, 4), SEMANTIC_THRESHOLDS);
  const selectedIds = new Set<TemplateId>(compatibility.accepted.map((match) => match.intent));
  selectedIds.add(classification.semantic_intent as TemplateId);

  const templates = [...selectedIds].map((intent) => selectTemplate(intent));
  const uniqueTemplates = templates
    .filter((template, index, list) => list.findIndex((candidate) => candidate.id === template.id) === index)
    .sort((a, b) => {
      if (a.intents.includes(classification.semantic_intent)) return -1;
      if (b.intents.includes(classification.semantic_intent)) return 1;
      return (TEMPLATE_PRIORITIES[b.id] ?? 0) - (TEMPLATE_PRIORITIES[a.id] ?? 0);
    });
  const { contract, conflicts } = mergeContracts(uniqueTemplates);
  const rejections = [...compatibility.rejected, ...semanticValidation.issues.map((issue) => `semantic_threshold:${issue}`)];

  return {
    templates: uniqueTemplates,
    conflicts,
    rejections,
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
