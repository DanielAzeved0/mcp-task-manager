import { logEvent, type TraceContext } from "../observability/logger.js";
import type { WorkspaceFile } from "./dependencyScanner.js";

export interface InlineCodeFile extends WorkspaceFile {
  virtualPath: string;
  language: string;
  source: "user_prompt";
  confidence: number;
}

export interface InlineCodeExtractionResult {
  hasInlineCode: boolean;
  inlineFiles: InlineCodeFile[];
  extractionAudit: {
    detectedPatterns: string[];
    rejectedCandidates: Array<{ reason: string; preview: string }>;
  };
}

const MAX_INLINE_FILES = 3;
const MINIMUM_CODE_LENGTH = 40;
const MARKDOWN_BLOCK_RE = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extensionForLanguage(language: string): string {
  if (language === "typescript") return "ts";
  if (language === "javascript") return "js";
  if (language === "json") return "json";
  if (language === "tsx") return "tsx";
  if (language === "jsx") return "jsx";
  return "txt";
}

function languageFromFence(fence: string, content: string): string {
  const normalizedFence = normalize(fence);
  if (["ts", "typescript"].includes(normalizedFence)) return "typescript";
  if (normalizedFence === "tsx") return "tsx";
  if (["js", "javascript"].includes(normalizedFence)) return "javascript";
  if (normalizedFence === "jsx") return "jsx";
  if (normalizedFence === "json") return "json";
  return inferLanguage(content);
}

function inferLanguage(content: string): string {
  const normalized = normalize(content);
  try {
    JSON.parse(content.trim());
    return "json";
  } catch {
    // Continue with source-like detection.
  }
  if ([": string", ": number", ": boolean", "interface ", "type ", " as ", ": any"].some((signal) => normalized.includes(signal))) {
    return "typescript";
  }
  if (["function ", "const ", "let ", "=>", "class ", "export ", "import "].some((signal) => normalized.includes(signal))) {
    return "javascript";
  }
  return "text";
}

function sourceSignalCount(content: string): number {
  const normalized = normalize(content);
  return ["function ", "const ", "let ", "var ", "=>", "interface ", "type ", "class ", "export ", "import ", "return "]
    .filter((signal) => normalized.includes(signal)).length;
}

function extractJsonCandidate(sourceRequest: string): string | null {
  const start = sourceRequest.indexOf("{");
  const end = sourceRequest.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const candidate = sourceRequest.slice(start, end + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function makeInlineFile(index: number, language: string, content: string, confidence: number): InlineCodeFile {
  const extension = extensionForLanguage(language);
  const virtualPath = `inline_prompt_${index}.${extension}`;
  return {
    path: virtualPath,
    virtualPath,
    language,
    content: content.trim(),
    source: "user_prompt",
    confidence,
  };
}

export function extractInlineCode(sourceRequest: string, semanticIntent: string, trace?: TraceContext): InlineCodeExtractionResult {
  logEvent("info", "inline_code_extraction_started", { semantic_intent: semanticIntent }, trace);

  const inlineFiles: InlineCodeFile[] = [];
  const detectedPatterns: string[] = [];
  const rejectedCandidates: Array<{ reason: string; preview: string }> = [];

  for (const match of sourceRequest.matchAll(MARKDOWN_BLOCK_RE)) {
    if (inlineFiles.length >= MAX_INLINE_FILES) break;
    const language = languageFromFence(match[1] ?? "", match[2] ?? "");
    const content = (match[2] ?? "").trim();
    if (content.length < 10) {
      rejectedCandidates.push({ reason: "markdown_block_too_short", preview: content.slice(0, 60) });
      continue;
    }
    detectedPatterns.push(`markdown_code_block:${language}`);
    inlineFiles.push(makeInlineFile(inlineFiles.length + 1, language, content, 0.98));
  }

  const withoutMarkdown = sourceRequest.replace(MARKDOWN_BLOCK_RE, " ");
  if (inlineFiles.length < MAX_INLINE_FILES) {
    const jsonCandidate = extractJsonCandidate(withoutMarkdown);
    if (jsonCandidate && jsonCandidate.length >= 8) {
      detectedPatterns.push("json_payload");
      inlineFiles.push(makeInlineFile(inlineFiles.length + 1, "json", jsonCandidate, 0.9));
    }
  }

  if (inlineFiles.length < MAX_INLINE_FILES) {
    const signalCount = sourceSignalCount(withoutMarkdown);
    const normalized = withoutMarkdown.trim();
    if (signalCount >= 2 && normalized.length >= MINIMUM_CODE_LENGTH) {
      const language = inferLanguage(normalized);
      detectedPatterns.push(`plain_source_snippet:${language}`);
      inlineFiles.push(makeInlineFile(inlineFiles.length + 1, language, normalized, 0.85));
    } else if (signalCount > 0) {
      rejectedCandidates.push({ reason: "insufficient_source_signals_or_length", preview: normalized.slice(0, 80) });
    }
  }

  for (const file of inlineFiles) {
    logEvent("info", "inline_code_detected", {
      language: file.language,
      virtual_path: file.virtualPath,
      confidence: file.confidence,
      content_length: file.content?.length ?? 0,
    }, trace);
    logEvent("info", "inline_code_context_created", {
      virtual_path: file.virtualPath,
      token_estimate: Math.ceil((file.content?.length ?? 0) / 4),
    }, trace);
  }

  if (inlineFiles.length === 0) {
    logEvent("info", "inline_code_extraction_skipped", { semantic_intent: semanticIntent }, trace);
  }
  logEvent("info", "inline_code_extraction_completed", {
    inline_file_count: inlineFiles.length,
  }, trace);

  return {
    hasInlineCode: inlineFiles.length > 0,
    inlineFiles,
    extractionAudit: {
      detectedPatterns,
      rejectedCandidates,
    },
  };
}
