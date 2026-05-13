import { logEvent, type TraceContext } from "../observability/logger.js";

export interface InlineContextIsolationFile {
  path: string;
  relevanceScore?: number;
  reasons?: string[];
}

export interface InlineContextIsolationResult<T extends InlineContextIsolationFile> {
  selectedFiles: T[];
  rejectedFiles: T[];
  applied: boolean;
  explicitFileSignal: boolean;
}

const EXPLICIT_FILE_SIGNALS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  "src/",
  "public/",
  "package.json",
  "readme.md",
  "arquivo",
  "pasta",
  "módulo",
  "modulo",
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\\/g, "/");
}

export function hasExplicitWorkspaceFileSignal(sourceRequest: string): boolean {
  const normalized = normalize(sourceRequest);
  return EXPLICIT_FILE_SIGNALS.some((signal) => normalized.includes(normalize(signal)));
}

export function applyInlineContextIsolation<T extends InlineContextIsolationFile>(input: {
  sourceRequest: string;
  inlineFiles: string[];
  selectedFiles: T[];
  trace?: TraceContext;
}): InlineContextIsolationResult<T> {
  if (input.inlineFiles.length === 0) {
    logEvent("info", "inline_context_isolation_skipped", {
      reason: "no_inline_files",
    }, input.trace);
    return {
      selectedFiles: input.selectedFiles,
      rejectedFiles: [],
      applied: false,
      explicitFileSignal: false,
    };
  }

  const explicitFileSignal = hasExplicitWorkspaceFileSignal(input.sourceRequest);
  if (explicitFileSignal) {
    logEvent("info", "inline_context_isolation_skipped", {
      reason: "explicit_file_signal_detected",
      inline_files: input.inlineFiles,
    }, input.trace);
    return {
      selectedFiles: input.selectedFiles,
      rejectedFiles: [],
      applied: false,
      explicitFileSignal,
    };
  }

  const inlineFileSet = new Set(input.inlineFiles);
  const selectedFiles = input.selectedFiles.filter((file) => inlineFileSet.has(file.path));
  const rejectedFiles = input.selectedFiles.filter((file) => !inlineFileSet.has(file.path));

  for (const file of rejectedFiles) {
    logEvent("info", "workspace_file_rejected_due_to_inline_isolation", {
      path: file.path,
      relevance_score: file.relevanceScore,
      reasons: file.reasons ?? [],
    }, input.trace);
  }

  logEvent("info", "inline_context_isolation_applied", {
    inline_files: input.inlineFiles,
    selected_files: selectedFiles.map((file) => file.path),
    rejected_count: rejectedFiles.length,
  }, input.trace);

  return {
    selectedFiles,
    rejectedFiles,
    applied: true,
    explicitFileSignal,
  };
}
