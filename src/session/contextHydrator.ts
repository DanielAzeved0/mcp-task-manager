import { extractInlineCode } from "../context/inlineCodeExtractor.js";
import { logEvent, type TraceContext } from "../observability/logger.js";
import { getRecentCodeMemory } from "./recentCodeMemory.js";

export interface SessionContextHydration {
  hydrated: boolean;
  source?: "recent_inline_code";
  selected_context: string[];
}

const CODE_REQUIRED_INTENTS = new Set(["code_analysis", "code_refactor"]);

function hasCodeInput(inputs: Record<string, unknown>): boolean {
  const value = inputs.code;
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function canUseRecentContext(sourceRequest: string): boolean {
  const normalized = sourceRequest
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return ["isso", "isto", "esse", "essa", "codigo", "code", "agora", "refatore", "analise"].some((term) => normalized.includes(term));
}

export function hydrateSessionContext(input: {
  sessionId?: string;
  sourceRequest: string;
  semanticIntent: string;
  inputs?: Record<string, unknown>;
  trace?: TraceContext;
}): { inputs: Record<string, unknown>; sessionContext: SessionContextHydration } {
  const inputs = { ...(input.inputs ?? {}) };
  const emptyContext: SessionContextHydration = { hydrated: false, selected_context: [] };

  if (!input.sessionId || !CODE_REQUIRED_INTENTS.has(input.semanticIntent) || hasCodeInput(inputs)) {
    return { inputs, sessionContext: emptyContext };
  }

  const inline = extractInlineCode(input.sourceRequest, input.semanticIntent, input.trace);
  if (inline.hasInlineCode || !canUseRecentContext(input.sourceRequest)) {
    return { inputs, sessionContext: emptyContext };
  }

  const recent = getRecentCodeMemory(input.sessionId);
  if (!recent) return { inputs, sessionContext: emptyContext };

  inputs.code = recent.files.map((file) => file.content ?? "").join("\n\n");
  inputs.code_source = recent.source;
  inputs.metadata = {
    ...((inputs.metadata && typeof inputs.metadata === "object") ? inputs.metadata as Record<string, unknown> : {}),
    code_source: recent.source,
    selected_context: recent.selectedContext,
  };

  logEvent("info", "session_context_hydrated", {
    session_id: input.sessionId,
    source: recent.source,
    selected_context: recent.selectedContext,
  }, input.trace);

  return {
    inputs,
    sessionContext: {
      hydrated: true,
      source: recent.source,
      selected_context: recent.selectedContext,
    },
  };
}
