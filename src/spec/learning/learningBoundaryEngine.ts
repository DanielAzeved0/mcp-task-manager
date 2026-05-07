import type { PromptSpec } from "../../schemas/promptSpec.js";

const DOMAIN_BOUNDARIES: Record<string, { allowedOutputs: string[]; blockedOutputs: string[] }> = {
  frontend_component: {
    allowedOutputs: ["ui_structure", "styles", "behavior", "accessibility", "structured_result", "metadata"],
    blockedOutputs: ["tables", "indexes", "migration_strategy"],
  },
  database_design: {
    allowedOutputs: ["tables", "indexes", "relationships", "migration_strategy", "structured_result", "metadata"],
    blockedOutputs: ["styles", "ui_structure", "accessibility"],
  },
  code_analysis: {
    allowedOutputs: [
      "strengths",
      "good_practices",
      "weaknesses",
      "improvement_opportunities",
      "maintainability_score",
      "summary",
      "structured_result",
      "metadata",
    ],
    blockedOutputs: ["endpoints", "request_schema", "response_schema", "tables", "indexes", "ui_structure", "styles"],
  },
};

export function enforceLearningBoundaries(
  spec: PromptSpec,
  intent: string,
): { spec: PromptSpec; violations: string[] } {
  const boundary = DOMAIN_BOUNDARIES[intent];
  if (!boundary) return { spec, violations: [] };

  const next = structuredClone(spec);
  const violations: string[] = [];

  for (const blockedOutput of boundary.blockedOutputs) {
    if (next.output_fields[blockedOutput]) {
      delete next.output_fields[blockedOutput];
      violations.push(blockedOutput);
    }
  }

  return { spec: next, violations };
}
