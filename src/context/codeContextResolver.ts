import fs from "fs";
import path from "path";
import { analyzeAst, buildSemanticAnalysisContext, type AstSemanticAnalysis } from "../analysis/astAnalyzer.js";
import { logEvent, type TraceContext } from "../observability/logger.js";
import { buildCodePack } from "./codePackBuilder.js";
import { mergeCodeContextFiles } from "./codeContextMerger.js";
import { scanDependencies, type DependencyMap, type WorkspaceFile } from "./dependencyScanner.js";
import { resolveSemanticContext, type SemanticContextResult } from "./embeddingContextEngine.js";
import { extractInlineCode } from "./inlineCodeExtractor.js";
import { applyInlineContextIsolation } from "./inlineContextIsolationPolicy.js";

export interface CodeContextResolverInput {
  sourceRequest: string;
  semanticIntent: string;
  workspaceRoot?: string;
  workspaceFiles?: WorkspaceFile[];
  additionalFiles?: WorkspaceFile[];
  maxSelectedFiles?: number;
  maxCodePackTokens?: number;
  trace?: TraceContext;
}

export interface SelectedCodeFile extends WorkspaceFile {
  relevanceScore: number;
  reasons: string[];
}

export interface CodeContextResult {
  selectedFiles: SelectedCodeFile[];
  dependencyMap: DependencyMap;
  codePack: string;
  tokenEstimate: number;
  inline: {
    hasInlineCode: boolean;
    inlineFiles: string[];
    languages: string[];
  };
  semanticAnalysis: AstSemanticAnalysis;
  semanticAnalysisContext: string;
  semanticContext: SemanticContextResult;
}

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json"]);
const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git", "coverage", ".next", "public"]);
const DEFAULT_MAX_FILES = 8;
const MIN_RELEVANCE = 0.7;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function listWorkspaceFiles(root: string): WorkspaceFile[] {
  const files: WorkspaceFile[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!CODE_EXTENSIONS.has(ext)) continue;
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath).replace(/\\/g, "/");
      try {
        const stat = fs.statSync(absolutePath);
        if (stat.size > 200_000) continue;
        files.push({ path: relativePath, content: fs.readFileSync(absolutePath, "utf-8") });
      } catch {
        // Ignore unreadable files; resolver remains best-effort.
      }
    }
  }
  walk(root);
  return files;
}

function requestTerms(sourceRequest: string): string[] {
  return normalize(sourceRequest)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !["esse", "essa", "para", "uma", "que", "com", "sem", "codigo", "code"].includes(term));
}

function intentTerms(intent: string): string[] {
  if (intent === "code_refactor") return ["service", "controller", "module", "modulo", "test", "spec"];
  if (intent === "code_analysis") return ["service", "controller", "config", "schema", "module"];
  if (intent === "api_design") return ["route", "routes", "controller", "schema", "dto", "api"];
  return [];
}

function scoreFile(file: WorkspaceFile, terms: string[], semanticIntent: string): { score: number; reasons: string[] } {
  if (file.path.startsWith("inline_prompt_")) {
    return { score: 1, reasons: ["inline_code_priority"] };
  }

  const pathText = normalize(file.path);
  const contentText = normalize((file.content ?? "").slice(0, 8000));
  let score = 0;
  const reasons: string[] = [];

  const explicitMatches = terms.filter((term) => pathText.includes(term));
  if (explicitMatches.length > 0) {
    score += 0.4;
    reasons.push(`explicit_file_match:${explicitMatches.join(",")}`);
  }

  const semanticMatches = [...terms, ...intentTerms(semanticIntent)].filter((term) => pathText.includes(term) || contentText.includes(term));
  if (semanticMatches.length > 0) {
    score += Math.min(0.3, semanticMatches.length * 0.08);
    reasons.push(`semantic_match:${semanticMatches.slice(0, 5).join(",")}`);
  }

  if (/controller|service|schema|dto|route|test|spec/.test(pathText)) {
    score += 0.1;
    reasons.push("architectural_role_match");
  }

  return { score: Number(Math.min(1, score).toFixed(4)), reasons };
}

function addDependencyScores(files: SelectedCodeFile[], dependencyMap: DependencyMap): SelectedCodeFile[] {
  const selectedPaths = new Set(files.map((file) => file.path));
  return files.map((file) => {
    const dependents = Object.entries(dependencyMap).filter(([, deps]) => deps.includes(file.path)).length;
    const dependencies = (dependencyMap[file.path] ?? []).filter((dep) => selectedPaths.has(dep)).length;
    const bump = dependents > 0 || dependencies > 0 ? 0.2 : 0;
    return {
      ...file,
      relevanceScore: Number(Math.min(1, file.relevanceScore + bump).toFixed(4)),
      reasons: bump ? [...file.reasons, "dependency_proximity"] : file.reasons,
    };
  });
}

export function resolveCodeContext(input: CodeContextResolverInput): CodeContextResult {
  logEvent("info", "code_context_resolution_started", {
    semantic_intent: input.semanticIntent,
  }, input.trace);

  const inlineExtraction = extractInlineCode(input.sourceRequest, input.semanticIntent, input.trace);
  const realWorkspaceFiles = input.workspaceFiles ?? listWorkspaceFiles(input.workspaceRoot ?? process.cwd());
  const additionalFiles = input.additionalFiles ?? [];
  const workspaceFiles = mergeCodeContextFiles(inlineExtraction.inlineFiles, [...additionalFiles, ...realWorkspaceFiles]);
  const dependencyMap = scanDependencies(workspaceFiles);
  const semanticContext = resolveSemanticContext({
    sourceRequest: input.sourceRequest,
    semanticIntent: input.semanticIntent,
    files: realWorkspaceFiles,
    trace: input.trace,
  });
  const semanticMatchesByPath = new Map(semanticContext.matches.map((match) => [match.path, match]));
  logEvent("info", "dependency_scan_completed", {
    file_count: workspaceFiles.length,
    dependency_entries: Object.keys(dependencyMap).length,
  }, input.trace);

  const terms = requestTerms(input.sourceRequest);
  const initiallyScored = workspaceFiles.map((file) => {
    const scored = scoreFile(file, terms, input.semanticIntent);
    const semanticMatch = semanticMatchesByPath.get(file.path);
    const semanticScore = semanticMatch ? Math.max(scored.score, semanticMatch.score) : scored.score;
    return {
      ...file,
      relevanceScore: semanticScore,
      reasons: semanticMatch ? [...scored.reasons, semanticMatch.reason] : scored.reasons,
    };
  });
  const dependencyAdjusted = addDependencyScores(initiallyScored, dependencyMap);
  let selectedFiles = dependencyAdjusted
    .filter((file) => file.relevanceScore >= MIN_RELEVANCE)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, input.maxSelectedFiles ?? DEFAULT_MAX_FILES);

  const isolation = applyInlineContextIsolation({
    sourceRequest: input.sourceRequest,
    inlineFiles: inlineExtraction.inlineFiles.map((file) => file.virtualPath),
    selectedFiles,
    trace: input.trace,
  });
  selectedFiles = isolation.selectedFiles;

  for (const file of selectedFiles) {
    logEvent("info", "code_context_file_selected", {
      path: file.path,
      relevance_score: file.relevanceScore,
      reasons: file.reasons,
    }, input.trace);
  }

  const pack = buildCodePack(selectedFiles, input.maxCodePackTokens ?? 12000, input.trace);
  const semanticAnalysis = analyzeAst(selectedFiles, input.trace);
  const semanticAnalysisContext = buildSemanticAnalysisContext(semanticAnalysis);
  if (semanticAnalysisContext) {
    logEvent("info", "semantic_analysis_context_injected", {
      files_analyzed: semanticAnalysis.files_analyzed,
      smell_count: semanticAnalysis.smells.length,
      recommendation_signals: semanticAnalysis.recommendation_signals,
    }, input.trace);
  }
  logEvent("info", "code_context_injected", {
    selected_files: selectedFiles.map((file) => file.path),
    token_estimate: pack.tokenEstimate,
  }, input.trace);

  return {
    selectedFiles,
    dependencyMap,
    codePack: pack.codePack,
    tokenEstimate: pack.tokenEstimate,
    inline: {
      hasInlineCode: inlineExtraction.hasInlineCode,
      inlineFiles: inlineExtraction.inlineFiles.map((file) => file.virtualPath),
      languages: [...new Set(inlineExtraction.inlineFiles.map((file) => file.language))],
    },
    semanticAnalysis,
    semanticAnalysisContext,
    semanticContext,
  };
}

export type { WorkspaceFile };
