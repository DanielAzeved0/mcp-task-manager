import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyArtifact, normalizeArtifactPath, parseSprintSummary, titleFromArtifactPath } from "./workspaceArtifacts.js";
import type { ArtifactKind, SprintStatus } from "./workspaceArtifacts.js";

export type MemoryDocumentType = "decision" | "project_fact" | "sprint_summary" | "reusable_context";
export type MemorySearchType = MemoryDocumentType | "artifact";

export type MemoryDocument = {
  id: string;
  type: MemoryDocumentType;
  title: string;
  content: string;
  tags: string[];
  relatedSprintId?: string;
  relatedArtifactPaths: string[];
  createdAt: string;
  updatedAt: string;
};

export type SprintHistoryItem = {
  sprintId: string;
  title: string;
  status: SprintStatus;
  sprintPath: string;
  specPath?: string;
  contractPath?: string;
  qaPath?: string;
  evaluationPath?: string;
  progressPath?: string;
  logPath?: string;
  toolExecutionPath?: string;
  score?: number;
  updatedAt?: string;
};

export type LocalMemoryIndex = {
  documents: MemoryDocument[];
  sprintHistory: SprintHistoryItem[];
  updatedAt: string;
};

export type MemorySearchQuery = {
  query: string;
  types?: MemorySearchType[];
  sprintId?: string;
  tags?: string[];
  limit?: number;
};

export type MemorySearchResult = {
  query: string;
  results: Array<{
    id: string;
    type: MemorySearchType;
    title: string;
    excerpt: string;
    path: string;
    relatedSprintId?: string;
    score: number;
  }>;
};

export type DecisionNoteInput = {
  title: string;
  content: string;
  tags?: string[];
  relatedSprintId?: string;
  relatedArtifactPaths?: string[];
};

export type DecisionNoteWriteResponse = {
  saved: true;
  path: string;
  document: MemoryDocument;
};

export type LocalMemorySummary = {
  documentCount: number;
  decisionCount: number;
  sprintHistoryCount: number;
  latestDecisionTitle: string | null;
};

export class LocalMemoryError extends Error {
  constructor(
    public readonly code:
      | "invalid_memory_document"
      | "invalid_search_query"
      | "invalid_decision_note"
      | "invalid_artifact_path"
      | "memory_write_failed"
      | "memory_read_failed",
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type ArtifactIndexEntry = {
  id: string;
  type: "artifact";
  title: string;
  path: string;
  content: string;
  relatedSprintId?: string;
};

const WORKSPACE_DIR = ".mcp-task";
const DECISIONS_DIR = ".mcp-task/memory/decisions";
const MAX_SEARCH_LIMIT = 25;
const MAX_INDEXED_CONTENT = 60_000;
const SUPPORTED_EXTENSIONS = new Set([".md", ".json", ".txt", ".log"]);

export async function buildLocalMemoryIndex(repoRoot: string): Promise<LocalMemoryIndex> {
  const artifacts = await listMemoryArtifacts(repoRoot);
  const sprintHistory = await buildSprintHistory(repoRoot, artifacts);
  const documents = await readMemoryDocuments(repoRoot, artifacts);

  return {
    documents,
    sprintHistory,
    updatedAt: new Date().toISOString(),
  };
}

export async function searchLocalMemory(repoRoot: string, queryInput: unknown): Promise<MemorySearchResult> {
  const query = validateMemorySearchQuery(queryInput);
  const index = await buildLocalMemoryIndex(repoRoot);
  const artifacts = await readArtifactIndex(repoRoot, await listMemoryArtifacts(repoRoot));
  const typeFilter = query.types?.length ? new Set(query.types) : null;
  const tagFilter = query.tags?.length ? new Set(query.tags.map((tag) => tag.toLowerCase())) : null;
  const needle = query.query.trim().toLowerCase();

  const memoryResults = index.documents
    .filter((document) => !typeFilter || typeFilter.has(document.type))
    .filter((document) => !query.sprintId || document.relatedSprintId === query.sprintId)
    .filter((document) => !tagFilter || document.tags.some((tag) => tagFilter.has(tag.toLowerCase())))
    .map((document) => scoreMemoryDocument(document, needle))
    .filter((result) => result.score > 0 || !needle);

  const artifactResults = artifacts
    .filter((artifact) => !typeFilter || typeFilter.has("artifact"))
    .filter((artifact) => !query.sprintId || artifact.relatedSprintId === query.sprintId)
    .map((artifact) => scoreArtifact(artifact, needle))
    .filter((result) => result.score > 0 || !needle);

  return {
    query: query.query,
    results: [...memoryResults, ...artifactResults]
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, query.limit ?? 10),
  };
}

export async function writeDecisionNote(repoRoot: string, input: unknown): Promise<DecisionNoteWriteResponse> {
  const note = validateDecisionNoteInput(input);
  const timestamp = new Date().toISOString();
  const id = slugify(`${timestamp.slice(0, 10)}-${note.title}`);
  const artifactPaths = note.relatedArtifactPaths ?? [];
  const document: MemoryDocument = {
    id,
    type: "decision",
    title: note.title.trim(),
    content: note.content.trim(),
    tags: normalizeTags(note.tags ?? []),
    relatedSprintId: note.relatedSprintId,
    relatedArtifactPaths: artifactPaths.map(normalizeMemoryArtifactPath),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  validateMemoryDocument(document);

  const relativePath = `${DECISIONS_DIR}/${id}.md`;
  const absolutePath = resolveMemoryPath(repoRoot, relativePath);
  const markdown = renderDecisionMarkdown(document);

  try {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, markdown, "utf8");
  } catch {
    throw new LocalMemoryError("memory_write_failed", "Failed to write decision note.", 500);
  }

  return {
    saved: true,
    path: relativePath,
    document,
  };
}

export function summarizeLocalMemory(index: LocalMemoryIndex): LocalMemorySummary {
  const decisions = index.documents.filter((document) => document.type === "decision");

  return {
    documentCount: index.documents.length,
    decisionCount: decisions.length,
    sprintHistoryCount: index.sprintHistory.length,
    latestDecisionTitle: decisions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.title ?? null,
  };
}

export function validateMemoryDocument(value: unknown): MemoryDocument {
  const document = value as Partial<MemoryDocument>;
  const types = new Set<MemoryDocumentType>(["decision", "project_fact", "sprint_summary", "reusable_context"]);

  if (!document || typeof document !== "object" || typeof document.id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/i.test(document.id)) {
    throw new LocalMemoryError("invalid_memory_document", "Memory document id is invalid.", 400);
  }

  if (!types.has(document.type as MemoryDocumentType)) {
    throw new LocalMemoryError("invalid_memory_document", "Memory document type is invalid.", 400);
  }

  if (typeof document.title !== "string" || !document.title.trim()) {
    throw new LocalMemoryError("invalid_memory_document", "Memory document title is required.", 400);
  }

  if (typeof document.content !== "string" || !document.content.trim()) {
    throw new LocalMemoryError("invalid_memory_document", "Memory document content is required.", 400);
  }

  if (!Array.isArray(document.tags) || !document.tags.every((tag) => typeof tag === "string")) {
    throw new LocalMemoryError("invalid_memory_document", "Memory document tags must be strings.", 400);
  }

  if (!Array.isArray(document.relatedArtifactPaths)) {
    throw new LocalMemoryError("invalid_memory_document", "Memory document relatedArtifactPaths must be an array.", 400);
  }

  const relatedArtifactPaths = document.relatedArtifactPaths.map(normalizeMemoryArtifactPath);

  if (document.relatedSprintId && !/^SPRINT-\d{3}$/.test(document.relatedSprintId)) {
    throw new LocalMemoryError("invalid_memory_document", "Memory document relatedSprintId is invalid.", 400);
  }

  if (typeof document.createdAt !== "string" || Number.isNaN(Date.parse(document.createdAt))) {
    throw new LocalMemoryError("invalid_memory_document", "Memory document createdAt must be an ISO date string.", 400);
  }

  if (typeof document.updatedAt !== "string" || Number.isNaN(Date.parse(document.updatedAt))) {
    throw new LocalMemoryError("invalid_memory_document", "Memory document updatedAt must be an ISO date string.", 400);
  }

  return {
    id: document.id,
    type: document.type as MemoryDocumentType,
    title: document.title,
    content: document.content,
    tags: document.tags,
    relatedSprintId: document.relatedSprintId,
    relatedArtifactPaths,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export function validateMemorySearchQuery(value: unknown): MemorySearchQuery {
  const query = value as Partial<MemorySearchQuery>;
  const types = new Set<MemorySearchType>(["decision", "project_fact", "sprint_summary", "reusable_context", "artifact"]);

  if (!query || typeof query !== "object") {
    throw new LocalMemoryError("invalid_search_query", "Search query is required.", 400);
  }

  if (typeof query.query !== "string") {
    throw new LocalMemoryError("invalid_search_query", "Search query must be a string.", 400);
  }

  if (query.types && (!Array.isArray(query.types) || !query.types.every((type) => types.has(type)))) {
    throw new LocalMemoryError("invalid_search_query", "Search types are invalid.", 400);
  }

  if (query.sprintId && !/^SPRINT-\d{3}$/.test(query.sprintId)) {
    throw new LocalMemoryError("invalid_search_query", "Search sprintId is invalid.", 400);
  }

  if (query.tags && (!Array.isArray(query.tags) || !query.tags.every((tag) => typeof tag === "string"))) {
    throw new LocalMemoryError("invalid_search_query", "Search tags are invalid.", 400);
  }

  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_SEARCH_LIMIT)) {
    throw new LocalMemoryError("invalid_search_query", `Search limit must be between 1 and ${MAX_SEARCH_LIMIT}.`, 400);
  }

  return {
    query: query.query,
    types: query.types,
    sprintId: query.sprintId,
    tags: query.tags,
    limit: query.limit,
  };
}

export function validateDecisionNoteInput(value: unknown): DecisionNoteInput {
  const note = value as Partial<DecisionNoteInput>;

  if (!note || typeof note !== "object") {
    throw new LocalMemoryError("invalid_decision_note", "Decision note is required.", 400);
  }

  if (typeof note.title !== "string" || !note.title.trim()) {
    throw new LocalMemoryError("invalid_decision_note", "Decision note title is required.", 400);
  }

  if (typeof note.content !== "string" || !note.content.trim()) {
    throw new LocalMemoryError("invalid_decision_note", "Decision note content is required.", 400);
  }

  if (note.tags && (!Array.isArray(note.tags) || !note.tags.every((tag) => typeof tag === "string"))) {
    throw new LocalMemoryError("invalid_decision_note", "Decision note tags must be strings.", 400);
  }

  if (note.relatedSprintId && !/^SPRINT-\d{3}$/.test(note.relatedSprintId)) {
    throw new LocalMemoryError("invalid_decision_note", "Decision note relatedSprintId is invalid.", 400);
  }

  if (note.relatedArtifactPaths) {
    if (!Array.isArray(note.relatedArtifactPaths)) {
      throw new LocalMemoryError("invalid_decision_note", "Decision note relatedArtifactPaths must be an array.", 400);
    }
    note.relatedArtifactPaths.forEach(normalizeMemoryArtifactPath);
  }

  return {
    title: note.title,
    content: note.content,
    tags: note.tags,
    relatedSprintId: note.relatedSprintId,
    relatedArtifactPaths: note.relatedArtifactPaths,
  };
}

export async function buildSprintHistory(repoRoot: string, artifactPaths: string[]): Promise<SprintHistoryItem[]> {
  const sprintPaths = artifactPaths
    .filter((artifactPath) => artifactPath.startsWith(".mcp-task/sprints/sprint-") && artifactPath.endsWith(".md"))
    .sort();
  const history: SprintHistoryItem[] = [];

  for (const sprintPath of sprintPaths) {
    try {
      const content = await readBoundedFile(repoRoot, sprintPath);
      const summary = parseSprintSummary(sprintPath, content);
      const related = findRelatedSprintArtifacts(summary.id, artifactPaths);
      history.push({
        sprintId: summary.id,
        title: summary.title,
        status: summary.status,
        sprintPath,
        ...related,
        score: await readEvaluationScore(repoRoot, related.evaluationPath),
        updatedAt: await readProgressUpdatedAt(repoRoot, related.progressPath),
      });
    } catch {
      continue;
    }
  }

  return history;
}

export function findRelatedSprintArtifacts(sprintId: string, artifactPaths: string[]): Omit<SprintHistoryItem, "sprintId" | "title" | "status" | "sprintPath"> {
  const sprintNumber = sprintId.match(/\d+/)?.[0]?.padStart(3, "0") ?? "";
  const sprintToken = `sprint-${sprintNumber}`;
  const findBy = (kind: ArtifactKind, suffix?: string) =>
    artifactPaths.find((artifactPath) => {
      if (classifyArtifact(artifactPath) !== kind || !artifactPath.includes(sprintToken)) return false;
      return suffix ? artifactPath.endsWith(suffix) : true;
    });

  return {
    specPath: findBy("spec"),
    contractPath: findBy("contract"),
    qaPath: findBy("qa"),
    evaluationPath: findBy("evaluation"),
    progressPath: findBy("progress"),
    logPath: findBy("log", ".md"),
    toolExecutionPath: artifactPaths.find((artifactPath) => artifactPath.startsWith(".mcp-task/tools/") && artifactPath.includes(sprintToken)),
  };
}

async function readMemoryDocuments(repoRoot: string, artifactPaths: string[]): Promise<MemoryDocument[]> {
  const documents: MemoryDocument[] = [];
  const memoryPaths = artifactPaths.filter((artifactPath) => artifactPath.startsWith(".mcp-task/memory/"));

  for (const memoryPath of memoryPaths) {
    try {
      if (memoryPath.endsWith(".json")) {
        const parsed = JSON.parse(await readBoundedFile(repoRoot, memoryPath)) as unknown;
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const candidate of candidates) {
          try {
            documents.push(validateMemoryDocument(candidate));
          } catch {
            continue;
          }
        }
        continue;
      }

      if (memoryPath.endsWith(".md")) {
        documents.push(markdownToMemoryDocument(memoryPath, await readBoundedFile(repoRoot, memoryPath)));
      }
    } catch {
      continue;
    }
  }

  return documents;
}

async function readArtifactIndex(repoRoot: string, artifactPaths: string[]): Promise<ArtifactIndexEntry[]> {
  const entries: ArtifactIndexEntry[] = [];

  for (const artifactPath of artifactPaths) {
    if (artifactPath.startsWith(".mcp-task/memory/decisions/")) continue;

    try {
      entries.push({
        id: slugify(artifactPath),
        type: "artifact",
        title: titleFromArtifactPath(artifactPath),
        path: artifactPath,
        content: await readBoundedFile(repoRoot, artifactPath),
        relatedSprintId: sprintIdFromPath(artifactPath),
      });
    } catch {
      continue;
    }
  }

  return entries;
}

async function listMemoryArtifacts(repoRoot: string): Promise<string[]> {
  const workspaceRoot = path.resolve(repoRoot, WORKSPACE_DIR);
  const results: string[] = [];

  async function walk(relativeDir: string): Promise<void> {
    const absoluteDir = path.resolve(workspaceRoot, relativeDir);
    let entries: string[] = [];

    try {
      entries = await readdir(absoluteDir);
    } catch {
      return;
    }

    for (const entry of entries.sort()) {
      const relativePath = relativeDir ? `${relativeDir}/${entry}` : entry;
      const absolutePath = path.resolve(workspaceRoot, relativePath);
      const extension = path.posix.extname(relativePath).toLowerCase();

      try {
        const childEntries = await readdir(absolutePath);
        if (childEntries.length >= 0) {
          await walk(relativePath);
          continue;
        }
      } catch {
        if (SUPPORTED_EXTENSIONS.has(extension)) {
          results.push(`${WORKSPACE_DIR}/${relativePath}`.replace(/\\/g, "/"));
        }
      }
    }
  }

  await walk("");
  return results.map(normalizeMemoryArtifactPath).sort();
}

function markdownToMemoryDocument(memoryPath: string, content: string): MemoryDocument {
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || titleFromArtifactPath(memoryPath);
  const timestamp = "2026-06-14T00:00:00.000Z";
  const relatedSprintId = sprintIdFromPath(content) ?? sprintIdFromPath(memoryPath);
  const relatedArtifactPaths = Array.from(content.matchAll(/\.mcp-task\/[^\s)`]+/g)).map((match) => normalizeMemoryArtifactPath(match[0]));

  return validateMemoryDocument({
    id: slugify(memoryPath),
    type: memoryPath.includes("/decisions/") ? "decision" : "project_fact",
    title,
    content,
    tags: [],
    relatedSprintId,
    relatedArtifactPaths,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function scoreMemoryDocument(document: MemoryDocument, query: string): MemorySearchResult["results"][number] {
  const haystack = `${document.title}\n${document.tags.join(" ")}\n${document.content}`.toLowerCase();
  const score = scoreText(haystack, document.title.toLowerCase(), query);
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    excerpt: excerptFor(document.content, query),
    path: `${DECISIONS_DIR}/${document.id}.md`,
    relatedSprintId: document.relatedSprintId,
    score,
  };
}

function scoreArtifact(artifact: ArtifactIndexEntry, query: string): MemorySearchResult["results"][number] {
  const score = scoreText(`${artifact.title}\n${artifact.content}`.toLowerCase(), artifact.title.toLowerCase(), query);
  return {
    id: artifact.id,
    type: "artifact",
    title: artifact.title,
    excerpt: excerptFor(artifact.content, query),
    path: artifact.path,
    relatedSprintId: artifact.relatedSprintId,
    score,
  };
}

function scoreText(haystack: string, title: string, query: string): number {
  if (!query) return 1;
  const terms = query.split(/\s+/).filter(Boolean);
  return terms.reduce((score, term) => score + countOccurrences(haystack, term) + (title.includes(term) ? 5 : 0), 0);
}

function countOccurrences(value: string, term: string): number {
  if (!term) return 0;
  return value.split(term).length - 1;
}

function excerptFor(content: string, query: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!query.trim()) return compact.slice(0, 180);
  const index = compact.toLowerCase().indexOf(query.trim().toLowerCase().split(/\s+/)[0] ?? "");
  const start = Math.max(0, index - 70);
  return compact.slice(start, start + 180);
}

async function readEvaluationScore(repoRoot: string, evaluationPath?: string): Promise<number | undefined> {
  if (!evaluationPath) return undefined;
  try {
    const parsed = JSON.parse(await readBoundedFile(repoRoot, evaluationPath)) as { score?: unknown };
    return typeof parsed.score === "number" && parsed.score >= 0 && parsed.score <= 100 ? parsed.score : undefined;
  } catch {
    return undefined;
  }
}

async function readProgressUpdatedAt(repoRoot: string, progressPath?: string): Promise<string | undefined> {
  if (!progressPath) return undefined;
  try {
    const parsed = JSON.parse(await readBoundedFile(repoRoot, progressPath)) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined;
  } catch {
    return undefined;
  }
}

async function readBoundedFile(repoRoot: string, artifactPath: string): Promise<string> {
  const absolutePath = resolveMemoryPath(repoRoot, artifactPath);
  return (await readFile(absolutePath, "utf8")).slice(0, MAX_INDEXED_CONTENT);
}

function normalizeMemoryArtifactPath(artifactPath: string): string {
  try {
    return normalizeArtifactPath(artifactPath);
  } catch {
    throw new LocalMemoryError("invalid_artifact_path", "Artifact path must stay inside .mcp-task/.", 400);
  }
}

function resolveMemoryPath(repoRoot: string, artifactPath: string): string {
  const normalized = normalizeMemoryArtifactPath(artifactPath);
  const workspaceRoot = path.resolve(repoRoot, WORKSPACE_DIR);
  const resolved = path.resolve(repoRoot, normalized);
  const relative = path.relative(workspaceRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new LocalMemoryError("invalid_artifact_path", "Resolved path escapes .mcp-task/.", 400);
  }

  return resolved;
}

function validateDecisionNoteInputForRender(document: MemoryDocument): string {
  return [
    `# ${document.title}`,
    "",
    `type: ${document.type}`,
    `id: ${document.id}`,
    `createdAt: ${document.createdAt}`,
    `updatedAt: ${document.updatedAt}`,
    `tags: ${document.tags.join(", ")}`,
    `relatedSprintId: ${document.relatedSprintId ?? ""}`,
    `relatedArtifactPaths: ${document.relatedArtifactPaths.join(", ")}`,
    "",
    document.content,
    "",
  ].join("\n");
}

function renderDecisionMarkdown(document: MemoryDocument): string {
  return validateDecisionNoteInputForRender(document);
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).sort();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "memory-document";
}

function sprintIdFromPath(value: string): string | undefined {
  const match = value.match(/SPRINT-(\d{3})|sprint-(\d{3})/i);
  const number = match?.[1] ?? match?.[2];
  return number ? `SPRINT-${number.padStart(3, "0")}` : undefined;
}
