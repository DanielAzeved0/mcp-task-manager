import { extractInlineCode } from "../context/inlineCodeExtractor.js";
import type { WorkspaceFile } from "../context/dependencyScanner.js";
import { logEvent, type TraceContext } from "../observability/logger.js";
import { SessionContextStore } from "./sessionContextStore.js";

export interface RecentCodeMemoryEntry {
  source: "recent_inline_code";
  files: WorkspaceFile[];
  selectedContext: string[];
  savedAt: string;
}

const recentCodeStore = new SessionContextStore<RecentCodeMemoryEntry>();

export function rememberRecentInlineCode(input: {
  sessionId: string;
  sourceRequest: string;
  semanticIntent: string;
  trace?: TraceContext;
}): RecentCodeMemoryEntry | undefined {
  const extracted = extractInlineCode(input.sourceRequest, input.semanticIntent, input.trace);
  if (!extracted.hasInlineCode) return undefined;

  const entry: RecentCodeMemoryEntry = {
    source: "recent_inline_code",
    files: extracted.inlineFiles.map((file) => ({
      path: file.virtualPath,
      content: file.content,
    })),
    selectedContext: extracted.inlineFiles.map((file) => file.virtualPath),
    savedAt: new Date().toISOString(),
  };
  recentCodeStore.set(input.sessionId, entry);
  logEvent("info", "recent_code_memory_saved", {
    session_id: input.sessionId,
    selected_context: entry.selectedContext,
  }, input.trace);
  return entry;
}

export function getRecentCodeMemory(sessionId: string): RecentCodeMemoryEntry | undefined {
  return recentCodeStore.get(sessionId);
}
