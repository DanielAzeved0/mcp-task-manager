import type { WorkspaceFile } from "./dependencyScanner.js";
import { logEvent, type TraceContext } from "../observability/logger.js";

export interface CodePackResult {
  codePack: string;
  tokenEstimate: number;
  truncated: boolean;
}

const DEFAULT_MAX_TOKENS = 12000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function trimContent(content: string, maxChars: number): { content: string; truncated: boolean } {
  if (content.length <= maxChars) return { content, truncated: false };
  const compact = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
  if (compact.length <= maxChars) return { content: compact, truncated: true };
  return {
    content: `${compact.slice(0, Math.max(0, maxChars - 80))}\n/* truncated by code pack token strategy */`,
    truncated: true,
  };
}

function fenceForPath(path: string): string {
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js")) return "js";
  if (path.endsWith(".ts")) return "ts";
  return "text";
}

export function buildCodePack(files: WorkspaceFile[], maxTokens = DEFAULT_MAX_TOKENS, trace?: TraceContext): CodePackResult {
  const maxChars = maxTokens * 4;
  const perFileBudget = Math.max(1200, Math.floor(maxChars / Math.max(1, files.length)));
  let truncated = false;
  const sections: string[] = [];

  for (const file of files) {
    const trimmed = trimContent(file.content ?? "", perFileBudget);
    truncated = truncated || trimmed.truncated;
    sections.push([
      `FILE: ${file.path}`,
      `\`\`\`${fenceForPath(file.path)}`,
      trimmed.content,
      "```",
    ].join("\n"));
  }

  let codePack = [
    "CODE_CONTEXT",
    JSON.stringify({ file_count: files.length, max_tokens: maxTokens }, null, 2),
    sections.join("\n\n"),
  ].join("\n\n");

  if (estimateTokens(codePack) > maxTokens) {
    codePack = codePack.slice(0, maxChars - 120) + "\n/* code pack truncated to token budget */";
    truncated = true;
  }

  if (truncated) {
    logEvent("warn", "code_pack_truncated", { token_estimate: estimateTokens(codePack), max_tokens: maxTokens }, trace);
  }
  logEvent("info", "code_pack_built", {
    file_count: files.length,
    token_estimate: estimateTokens(codePack),
    truncated,
  }, trace);

  return {
    codePack,
    tokenEstimate: estimateTokens(codePack),
    truncated,
  };
}
