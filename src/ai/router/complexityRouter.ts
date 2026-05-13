import type { CodeMetrics } from "../../analysis/codeMetrics.js";
import type { TraceContext } from "../../observability/logger.js";
import { logEvent } from "../../observability/logger.js";

export type ComplexityLevel = "low" | "medium" | "high";
export type ComplexitySelectedBackend = "deterministic_builder" | "llama" | "gemini";

export interface ComplexityRoutingDecision {
  score: number;
  level: ComplexityLevel;
  selected_backend: ComplexitySelectedBackend;
  compact_output_required: boolean;
  reasons: string[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function contribution(value: number, divisor: number, weight: number): number {
  return clamp(value / divisor) * weight;
}

export function routeByAstComplexity(input: {
  metrics: CodeMetrics;
  fileCount: number;
  tokenEstimate: number;
  smellCount: number;
  availableBackends?: string[];
  trace?: TraceContext;
}): ComplexityRoutingDecision {
  const { metrics } = input;
  const score = clamp(
    contribution(metrics.cyclomatic_complexity, 12, 0.22)
    + contribution(metrics.max_nested_depth, 5, 0.2)
    + contribution(metrics.loop_count, 6, 0.1)
    + contribution(metrics.conditional_count, 8, 0.1)
    + contribution(metrics.any_usage_count, 8, 0.12)
    + contribution(metrics.function_count, 12, 0.08)
    + contribution(input.fileCount, 6, 0.08)
    + contribution(input.tokenEstimate, 12000, 0.05)
    + contribution(input.smellCount, 8, 0.15),
  );
  const roundedScore = Number(score.toFixed(2));
  const level: ComplexityLevel = roundedScore >= 0.68 ? "high" : roundedScore >= 0.35 ? "medium" : "low";
  const available = new Set(input.availableBackends ?? []);
  const selected_backend: ComplexitySelectedBackend =
    level === "high" || level === "medium"
      ? available.has("gemini") ? "gemini" : available.has("llama") ? "llama" : "deterministic_builder"
      : available.has("llama") ? "llama" : "deterministic_builder";

  const reasons: string[] = [];
  if (metrics.cyclomatic_complexity >= 3) reasons.push("cyclomatic_complexity");
  if (metrics.max_nested_depth >= 2) reasons.push("nested_depth");
  if (metrics.loop_count > 0) reasons.push("loop_count");
  if (metrics.conditional_count >= 2) reasons.push("conditional_count");
  if (metrics.any_usage_count > 0) reasons.push("any_usage_count");
  if (metrics.function_count >= 4) reasons.push("function_count");
  if (input.fileCount >= 3) reasons.push("file_count");
  if (input.tokenEstimate > 6000) reasons.push("token_estimate");
  if (input.smellCount > 0) reasons.push("ast_smells");
  if (reasons.length === 0) reasons.push("low_ast_complexity");

  const decision = {
    score: roundedScore,
    level,
    selected_backend,
    compact_output_required: level === "high",
    reasons,
  };

  logEvent("info", "complexity_routing_completed", {
    complexity_routing: decision,
  }, input.trace);

  return decision;
}
