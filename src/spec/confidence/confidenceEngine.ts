import type { ClassificationResult } from "../../ai/router/semanticClassifier.js";
import type { PromptSpec } from "../../schemas/promptSpec.js";

export interface ConfidenceReport {
  classification: number;
  schema_match: number;
  semantic_alignment: number;
  ai_stability: number;
  provider_reliability: number;
  template_alignment: number;
  validation_confidence: number;
}

export interface QualityBreakdown {
  structural_quality: number;
  semantic_precision: number;
  intent_match: number;
  template_fit: number;
  provider_execution_quality: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(10, Number(value.toFixed(1))));
}

export function calculateConfidence(input: {
  classification: ClassificationResult;
  spec: PromptSpec;
  validationIssues: string[];
  templateFields: { inputs: string[]; outputs: string[] };
  fallbackUsed: boolean;
  providerReliability?: number;
}): ConfidenceReport {
  const inputMatches = input.templateFields.inputs.filter((field) => field in input.spec.input_fields).length;
  const outputMatches = input.templateFields.outputs.filter((field) => field in input.spec.output_fields).length;
  const totalTemplateFields = Math.max(1, input.templateFields.inputs.length + input.templateFields.outputs.length);
  const matchScore = ((inputMatches + outputMatches) / totalTemplateFields) * 10;

  const semanticAlignment = input.classification.confidence * 10;
  const providerReliability = (input.providerReliability ?? (input.fallbackUsed ? 0.82 : 0.9)) * 10;

  return {
    classification: clamp(input.classification.confidence * 10),
    schema_match: clamp(matchScore),
    semantic_alignment: clamp(semanticAlignment),
    ai_stability: clamp(input.fallbackUsed ? 8 : 7),
    provider_reliability: clamp(providerReliability),
    template_alignment: clamp(matchScore),
    validation_confidence: clamp(input.validationIssues.length === 0 ? 9.5 : Math.max(4, 9 - input.validationIssues.length)),
  };
}

export function calculateQualityBreakdown(input: {
  confidence: ConfidenceReport;
  fallbackUsed: boolean;
  fallbackType?: string;
  provider: string;
}): QualityBreakdown {
  const providerExecutionQuality = input.fallbackUsed || input.provider === "fallback" ? 0 : input.confidence.provider_reliability;
  const semanticPrecision = input.fallbackType === "generic"
    ? Math.min(input.confidence.semantic_alignment, 6)
    : input.confidence.semantic_alignment;

  return {
    structural_quality: input.confidence.validation_confidence,
    semantic_precision: semanticPrecision,
    intent_match: input.confidence.classification,
    template_fit: input.confidence.template_alignment,
    provider_execution_quality: providerExecutionQuality,
  };
}
