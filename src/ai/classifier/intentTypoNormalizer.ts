import { logEvent, type TraceContext } from "../../observability/logger.js";

export interface IntentTypoNormalization {
  originalPrompt: string;
  normalizedPrompt: string;
  normalizationApplied: boolean;
  normalizedTerms: string[];
}

const NORMALIZATION_RULES = [
  ["refature", "refatore"],
  ["refatora", "refatore"],
  ["refatorar", "refatore"],
  ["refatoracao", "refatore"],
  ["refatoração", "refatore"],
  ["refactore", "refatore"],
  ["refactor", "refatore"],
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordPattern(term: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(term)})(?=$|[^\\p{L}\\p{N}_])`, "giu");
}

export function normalizeIntentTypos(prompt: string, trace?: TraceContext): IntentTypoNormalization {
  logEvent("info", "intent_typo_normalization_started", {
    prompt_length: prompt.length,
  }, trace);

  let normalizedPrompt = prompt;
  const normalizedTerms: string[] = [];

  for (const [from, to] of NORMALIZATION_RULES) {
    normalizedPrompt = normalizedPrompt.replace(wordPattern(from), (full, prefix: string, matched: string) => {
      normalizedTerms.push(`${matched}->${to}`);
      logEvent("info", "intent_typo_normalized", {
        from: matched,
        to,
      }, trace);
      return `${prefix}${to}`;
    });
  }

  const normalizationApplied = normalizedTerms.length > 0;
  logEvent("info", "intent_typo_normalization_completed", {
    normalization_applied: normalizationApplied,
    normalized_terms: normalizedTerms,
  }, trace);

  return {
    originalPrompt: prompt,
    normalizedPrompt,
    normalizationApplied,
    normalizedTerms,
  };
}
