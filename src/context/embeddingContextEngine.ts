import { logEvent, type TraceContext } from "../observability/logger.js";
import { buildContextIndex } from "./contextIndexBuilder.js";
import type { WorkspaceFile } from "./dependencyScanner.js";
import { extractInlineCode } from "./inlineCodeExtractor.js";

export interface SemanticContextMatch {
  path: string;
  score: number;
  reason: "semantic_similarity";
}

export interface SemanticContextResult {
  enabled: boolean;
  matches: SemanticContextMatch[];
}

const MIN_SEMANTIC_SCORE = 0.62;
const INTERNAL_RUNTIME_PATHS = [
  "src/routes/",
  "src/services/",
  "src/context/",
  "src/ai/",
  "promptSpecHistory.json",
  "mcp.json",
];
const SEMANTIC_CODE_STOPWORDS = new Set([
  "function",
  "return",
  "if",
  "for",
  "true",
  "false",
  "const",
  "let",
  "var",
  "any",
  "length",
  "push",
  "map",
  "filter",
  "code",
  "codigo",
  "refatore",
  "refatorar",
  "analise",
  "analisar",
  "melhorar",
  "legibilidade",
  "readability",
  "quality",
  "esse",
  "essa",
  "isso",
  "isto",
]);

const QUERY_EXPANSIONS: Array<{ triggers: string[]; terms: string[] }> = [
  {
    triggers: ["autenticacao", "autenticação", "auth", "login"],
    terms: ["auth", "authentication", "jwt", "token", "session", "user", "login", "credential"],
  },
  {
    triggers: ["usuario", "usuário", "user"],
    terms: ["user", "account", "profile", "repository", "session"],
  },
  {
    triggers: ["pagamento", "payment", "billing"],
    terms: ["payment", "billing", "invoice", "checkout", "subscription"],
  },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function expandedQuery(sourceRequest: string, semanticIntent: string): { query: string; expansionTerms: string[] } {
  const inline = extractInlineCode(sourceRequest, "semantic_context_query");
  const querySource = inline.hasInlineCode ? inline.naturalLanguagePrompt : sourceRequest;
  const normalized = normalize(querySource);
  const expansionTerms = QUERY_EXPANSIONS
    .filter((group) => group.triggers.some((trigger) => normalized.includes(normalize(trigger))))
    .flatMap((group) => group.terms);
  return {
    query: [querySource, semanticIntent, ...new Set(expansionTerms)].join(" "),
    expansionTerms: [...new Set(expansionTerms)],
  };
}

function tokenizeMeaningfulTerms(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9_\s/-]/g, " ")
    .replace(/[/-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .filter((term) => !SEMANTIC_CODE_STOPWORDS.has(term));
}

function hasExplicitDomainSignal(sourceRequest: string, expansionTerms: string[]): boolean {
  if (expansionTerms.length > 0) return true;
  const inline = extractInlineCode(sourceRequest, "semantic_context_probe");
  const meaningfulTerms = tokenizeMeaningfulTerms(inline.hasInlineCode ? inline.naturalLanguagePrompt : sourceRequest);
  return meaningfulTerms.some((term) => [".ts", ".tsx", ".js", ".jsx", ".json", "src", "public", "auth", "jwt", "session", "controller", "service", "repository"].includes(term));
}

function isInlineSimpleCodeRequest(sourceRequest: string, expansionTerms: string[]): boolean {
  const inline = extractInlineCode(sourceRequest, "semantic_context_probe");
  if (!inline.hasInlineCode) return false;
  if (hasExplicitDomainSignal(sourceRequest, expansionTerms)) return false;
  return true;
}

function isInternalRuntimePath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  return INTERNAL_RUNTIME_PATHS.some((blocked) => normalizedPath.includes(blocked));
}

function domainSignalBoost(path: string, content: string, sourceRequest: string, expansionTerms: string[]): number {
  const terms = [...new Set([...expansionTerms, ...tokenizeMeaningfulTerms(sourceRequest)])];
  if (terms.length === 0) return 0;
  const haystack = normalize(`${path} ${content.slice(0, 2000)}`);
  const hits = terms.filter((term) => haystack.includes(normalize(term))).length;
  const compoundHits = terms
    .filter((term) => term.includes("_") || term.length >= 8)
    .filter((term) => haystack.includes(normalize(term).replace(/_/g, "")) || haystack.includes(normalize(term).replace(/_/g, " "))).length;
  return Math.min(0.18, hits * 0.03 + compoundHits * 0.05);
}

function aliasOverlapScore(path: string, content: string, expansionTerms: string[]): number {
  if (expansionTerms.length === 0) return 0;
  const haystack = normalize(`${path} ${content.slice(0, 4000)}`);
  const hits = expansionTerms.filter((term) => haystack.includes(normalize(term))).length;
  return hits / expansionTerms.length;
}

export function resolveSemanticContext(input: {
  sourceRequest: string;
  semanticIntent: string;
  files: WorkspaceFile[];
  trace?: TraceContext;
}): SemanticContextResult {
  if (input.files.length === 0) {
    return { enabled: true, matches: [] };
  }

  const index = buildContextIndex(input.files);
  logEvent("info", "semantic_context_index_built", {
    file_count: index.fileCount,
    chunk_count: index.chunkCount,
  }, input.trace);

  const query = expandedQuery(input.sourceRequest, input.semanticIntent);
  const inlineSimpleCodeRequest = isInlineSimpleCodeRequest(input.sourceRequest, query.expansionTerms);
  if (inlineSimpleCodeRequest) {
    logEvent("info", "semantic_context_noise_suppressed", {
      reason: "inline_simple_code_without_domain_signal",
      ignored_stopwords: [...SEMANTIC_CODE_STOPWORDS].slice(0, 14),
    }, input.trace);
    return { enabled: true, matches: [] };
  }
  const rawMatches = index.store.search(query.query, Math.max(12, input.files.length * 2));
  const bestByPath = new Map<string, SemanticContextMatch>();
  const fileByPath = new Map(input.files.map((file) => [file.path, file]));

  for (const match of rawMatches) {
    const file = fileByPath.get(match.chunk.path);
    const overlap = aliasOverlapScore(match.chunk.path, file?.content ?? "", query.expansionTerms);
    const baseScore = query.expansionTerms.length > 0 && overlap > 0
      ? Math.min(1, 0.55 + Math.max(0, match.score) * 0.25 + overlap * 0.4)
      : Math.max(0, match.score);
    const internalPenalty = inlineSimpleCodeRequest && isInternalRuntimePath(match.chunk.path) ? 0.3 : 0;
    const score = Math.max(0, baseScore + domainSignalBoost(match.chunk.path, file?.content ?? "", input.sourceRequest, query.expansionTerms) - internalPenalty);
    const rounded = Number(score.toFixed(2));
    if (rounded < MIN_SEMANTIC_SCORE) continue;

    const current = bestByPath.get(match.chunk.path);
    if (!current || rounded > current.score) {
      bestByPath.set(match.chunk.path, {
        path: match.chunk.path,
        score: rounded,
        reason: "semantic_similarity",
      });
    }
  }

  const matches = [...bestByPath.values()].sort((a, b) => b.score - a.score);
  for (const match of matches) {
    logEvent("info", "semantic_context_match_selected", {
      path: match.path,
      score: match.score,
      reason: match.reason,
    }, input.trace);
  }

  return {
    enabled: true,
    matches,
  };
}
