import { extractInlineCode } from "../../context/inlineCodeExtractor.js";
import { logEvent, type TraceContext } from "../../observability/logger.js";

export interface RuntimeInputHydrationResult {
  inputs: Record<string, unknown>;
  hydrated: boolean;
  codeSource?: "inline_prompt";
  inlineFiles: string[];
}

const CODE_REQUIRED_INTENTS = new Set(["code_analysis", "code_refactor"]);

function hasValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

export function hydrateInlineCodeBeforeRuntimeGate(input: {
  sourceRequest: string;
  semanticIntent: string;
  inputs?: Record<string, unknown>;
  trace?: TraceContext;
}): RuntimeInputHydrationResult {
  const normalizedInputs = { ...(input.inputs ?? {}) };

  if (!CODE_REQUIRED_INTENTS.has(input.semanticIntent)) {
    logEvent("info", "inline_code_pre_gate_skipped", {
      semantic_intent: input.semanticIntent,
      reason: "intent_does_not_require_code",
    }, input.trace);
    return { inputs: normalizedInputs, hydrated: false, inlineFiles: [] };
  }

  logEvent("info", "inline_code_pre_gate_started", {
    semantic_intent: input.semanticIntent,
  }, input.trace);

  if (hasValue(normalizedInputs.code)) {
    logEvent("info", "inline_code_pre_gate_skipped", {
      semantic_intent: input.semanticIntent,
      reason: "explicit_code_already_present",
    }, input.trace);
    return { inputs: normalizedInputs, hydrated: false, inlineFiles: [] };
  }

  const extracted = extractInlineCode(input.sourceRequest, input.semanticIntent, input.trace);
  if (!extracted.hasInlineCode) {
    logEvent("info", "inline_code_pre_gate_skipped", {
      semantic_intent: input.semanticIntent,
      reason: "no_inline_code_detected",
    }, input.trace);
    return { inputs: normalizedInputs, hydrated: false, inlineFiles: [] };
  }

  normalizedInputs.code = extracted.inlineFiles.map((file) => file.content ?? "").join("\n\n");
  normalizedInputs.code_source = "inline_prompt";
  normalizedInputs.metadata = {
    ...((normalizedInputs.metadata && typeof normalizedInputs.metadata === "object") ? normalizedInputs.metadata as Record<string, unknown> : {}),
    code_source: "inline_prompt",
    inline_files: extracted.inlineFiles.map((file) => file.virtualPath),
  };

  logEvent("info", "inline_code_pre_gate_hydrated", {
    semantic_intent: input.semanticIntent,
    inline_files: extracted.inlineFiles.map((file) => file.virtualPath),
  }, input.trace);
  logEvent("info", "runtime_gate_satisfied_by_inline_code", {
    semantic_intent: input.semanticIntent,
    code_source: "inline_prompt",
  }, input.trace);

  return {
    inputs: normalizedInputs,
    hydrated: true,
    codeSource: "inline_prompt",
    inlineFiles: extracted.inlineFiles.map((file) => file.virtualPath),
  };
}
