import type { IntentDefinition } from "./intentCatalog.js";
import { applyIntentPrioritizationMatrix } from "./intentPrioritizationMatrix.js";

export interface ClassificationTrace {
  intent_scores: Record<string, number>;
  negative_penalties: Record<string, number>;
  boosts: Record<string, number>;
  final_scores: Record<string, number>;
  prioritization?: {
    priority_intent?: string;
    domain_weight?: number;
    verb_weight?: number;
    context_weight?: number;
    boosts: Record<string, number>;
    penalties: Record<string, number>;
    reasons: string[];
  };
  ambiguity_detected?: boolean;
  confidence_gap?: number;
  action_intent?: string;
  domain?: string;
  task?: string;
  decision_reason?: string;
}

function normalizePrompt(prompt: string): string {
  return prompt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ");
}

function containsTerm(prompt: string, term: string): boolean {
  const normalizedTerm = normalizePrompt(term).trim();
  if (!normalizedTerm) return false;
  return prompt.includes(normalizedTerm);
}

const API_REQUIRED_POSITIVE_TERMS = ["api", "endpoint", "request", "response", "status code", "rest", "graphql", "gateway"];

export function applyIntentScoring(input: {
  prompt: string;
  definitions: IntentDefinition[];
  baseScores: Record<string, number>;
}): ClassificationTrace {
  const normalizedPrompt = normalizePrompt(input.prompt);
  const negative_penalties: Record<string, number> = {};
  const boosts: Record<string, number> = {};
  const final_scores: Record<string, number> = {};

  for (const definition of input.definitions) {
    const baseScore = input.baseScores[definition.intent] ?? 0;
    const negativeHits = (definition.negativeTerms ?? []).filter((term) => containsTerm(normalizedPrompt, term));
    const boostHits = (definition.boostKeywords ?? []).filter((term) => containsTerm(normalizedPrompt, term));

    const penalty = Number((-0.11 * negativeHits.length).toFixed(4));
    const boostMultiplier = definition.boostMultiplier ?? 1;
    const boost = boostHits.length > 0
      ? Number((Math.min(0.5, 0.08 * boostHits.length * boostMultiplier)).toFixed(4))
      : 0;
    const finalScore = Math.max(0, baseScore + penalty + boost);

    negative_penalties[definition.intent] = penalty;
    boosts[definition.intent] = boost;
    final_scores[definition.intent] = Number(finalScore.toFixed(4));
  }

  const codeAnalysisBoost = boosts.code_analysis ?? 0;
  const apiHasExplicitSignal = API_REQUIRED_POSITIVE_TERMS.some((term) => containsTerm(normalizedPrompt, term));
  if (codeAnalysisBoost > 0 && !apiHasExplicitSignal && final_scores.api_design !== undefined) {
    const conditionalPenalty = -0.28;
    negative_penalties.api_design = Number(((negative_penalties.api_design ?? 0) + conditionalPenalty).toFixed(4));
    final_scores.api_design = Number(Math.max(0, final_scores.api_design + conditionalPenalty).toFixed(4));
  }

  const prioritization = applyIntentPrioritizationMatrix(input.prompt);
  for (const [intent, boost] of Object.entries(prioritization.boosts)) {
    boosts[intent] = Number(((boosts[intent] ?? 0) + boost).toFixed(4));
    final_scores[intent] = Number(Math.max(0, (final_scores[intent] ?? 0) + boost).toFixed(4));
  }
  for (const [intent, penalty] of Object.entries(prioritization.penalties)) {
    negative_penalties[intent] = Number(((negative_penalties[intent] ?? 0) + penalty).toFixed(4));
    final_scores[intent] = Number(Math.max(0, (final_scores[intent] ?? 0) + penalty).toFixed(4));
  }

  const maxScore = Math.max(0.0001, ...Object.values(final_scores));
  for (const [intent, score] of Object.entries(final_scores)) {
    final_scores[intent] = Number((score / maxScore).toFixed(4));
  }

  return {
    intent_scores: input.baseScores,
    negative_penalties,
    boosts,
    final_scores,
    prioritization,
  };
}
