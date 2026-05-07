import { analyzeSemanticIntent } from "../classifier/semanticIntentEngine.js";
import type { ClassificationTrace } from "../classifier/classificationScoring.js";

export type PromptComplexity = "simple" | "medium" | "complex" | "critical";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type RoutingRecommendation = "llama" | "gemini";

export interface ClassificationResult {
  prompt_type: PromptComplexity;
  complexity_score: number;
  semantic_intent: string;
  risk_level: RiskLevel;
  routing_recommendation: RoutingRecommendation;
  confidence: number;
  signals: string[];
  classification_trace: ClassificationTrace;
  classification_decision?: {
    domain?: string;
    task?: string;
    ambiguity_detected?: boolean;
    confidence_gap?: number;
    decision_reason?: string;
  };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function estimateStructuralComplexity(prompt: string): number {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const punctuationWeight = (prompt.match(/[,;:\n]/g)?.length ?? 0) * 0.015;
  const specLanguageWeight = /\b(requirements?|architecture|observability|governance|policy|distributed|migration|contract|orchestration)\b/i.test(prompt) ? 0.18 : 0;
  return clampScore(Math.min(0.38, words.length / 140) + punctuationWeight + specLanguageWeight);
}

function riskFromScore(score: number): RiskLevel {
  if (score >= 0.72) return "critical";
  if (score >= 0.48) return "high";
  if (score >= 0.24) return "medium";
  return "low";
}

export function classifyPromptDetailed(prompt: string): ClassificationResult {
  const semantic = analyzeSemanticIntent(prompt);
  const structuralComplexity = estimateStructuralComplexity(prompt);
  const secondaryRiskBias = Math.max(0, ...semantic.secondary.map((match) => match.riskBias * Math.max(0.4, match.similarity)));
  const riskScore = clampScore(semantic.primary.riskBias + secondaryRiskBias + structuralComplexity * 0.65);
  const risk_level = riskFromScore(riskScore);
  const complexity_score = clampScore(structuralComplexity + semantic.primary.similarity * 0.28 + semantic.primary.riskBias);

  const prompt_type: PromptComplexity =
    risk_level === "critical" ? "critical" :
    risk_level === "high" ? "complex" :
    complexity_score >= 0.58 ? "complex" :
    complexity_score >= 0.32 ? "medium" :
    "simple";

  const routing_recommendation: RoutingRecommendation =
    risk_level === "low" && (prompt_type === "simple" || prompt_type === "medium") ? "llama" : "gemini";

  return {
    prompt_type,
    complexity_score,
    semantic_intent: semantic.primary.intent,
    risk_level,
    routing_recommendation,
    confidence: semantic.semanticConfidence,
    signals: [
      `intent:${semantic.primary.intent}`,
      `similarity:${semantic.primary.similarity}`,
      `risk:${risk_level}`,
      `route:${routing_recommendation}`,
      ...semantic.secondary.map((match) => `secondary:${match.intent}:${match.similarity}`),
    ],
    classification_trace: semantic.classificationTrace,
    classification_decision: {
      domain: semantic.classificationTrace.domain,
      task: semantic.classificationTrace.task,
      ambiguity_detected: semantic.classificationTrace.ambiguity_detected,
      confidence_gap: semantic.classificationTrace.confidence_gap,
      decision_reason: semantic.classificationTrace.decision_reason,
    },
  };
}

export function classifyPrompt(prompt: string): "simple" | "complex" {
  const result = classifyPromptDetailed(prompt);
  return result.routing_recommendation === "llama" ? "simple" : "complex";
}
