import { access, appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ensurePackageScriptProposals,
  readToolExecutionState,
  summarizeToolExecution,
  type ToolExecutionSummary,
} from "../mcp/toolExecutionHarness.js";
import { buildLocalMemoryIndex, summarizeLocalMemory, type LocalMemorySummary } from "./localMemory.js";

export type SprintStatus =
  | "planned"
  | "contract_ready"
  | "building"
  | "qa_running"
  | "failed"
  | "passed"
  | "done";

export type ArtifactKind =
  | "spec"
  | "sprint"
  | "contract"
  | "evaluation"
  | "qa"
  | "log"
  | "memory"
  | "agent"
  | "progress"
  | "tool"
  | "roadmap"
  | "unknown";

export type TerminalEventLevel = "info" | "ok" | "warn" | "error";

export type SprintSummary = {
  id: string;
  title: string;
  status: SprintStatus;
  path: string;
};

export type ArtifactSummary = {
  path: string;
  kind: ArtifactKind;
  title: string;
};

export type EvaluationSummary = {
  sprintId: string;
  status: "passed" | "failed";
  score: number;
};

export type TerminalEvent = {
  level: TerminalEventLevel;
  text: string;
  sourcePath?: string;
};

export type AgentRole = "Planner" | "Contract" | "Builder" | "QA" | "Architect" | "Security" | "Evaluator";
export type AgentStatus = "idle" | "active" | "blocked" | "complete" | "failed";
export type ActivityEventType = "created" | "started" | "progressed" | "blocked" | "completed" | "failed" | "validated";
export type PipelineStage = "SPEC" | "Contract" | "Build" | "QA" | "Evaluation" | "Done";

export type AgentState = {
  name: string;
  role: AgentRole;
  goal: string;
  allowed_actions: string[];
  forbidden_actions: string[];
  inputs: string[];
  outputs: string[];
  status: AgentStatus;
};

export type ActivityEvent = {
  id: string;
  sprintId: string;
  agent: string;
  type: ActivityEventType;
  message: string;
  timestamp: string;
  artifactPath?: string;
};

export type SprintProgressState = {
  sprintId: string;
  stage: PipelineStage;
  status: SprintStatus;
  agents: AgentState[];
  events: ActivityEvent[];
  updatedAt: string;
};

export type QaItemStatus = "passed" | "failed" | "pending";
export type QaResultStatus = "passed" | "failed" | "pending";

export type QaItem = {
  id: string;
  label: string;
  status: QaItemStatus;
  evidence?: string;
  failureReason?: string;
};

export type QaResult = {
  sprintId: string;
  contractPath: string;
  status: QaResultStatus;
  items: QaItem[];
  validatedAt: string;
};

export type EvaluationDocument = {
  sprintId: string;
  status: "passed" | "failed";
  score: number;
  checks: {
    contractCompliance: boolean;
    architecture: boolean;
    simplicity: boolean;
    offlineSupport: boolean;
    uiConsistency: boolean;
    validation: boolean;
  };
  failures: string[];
  recommendations: string[];
};

export type EvaluationGateSummary = {
  sprintId: string | null;
  passed: boolean;
  doneBlocked: boolean;
  message: string;
  score: number | null;
  qaStatus: QaResultStatus | "missing";
};

export type WorkspaceSummary = {
  productName: string;
  shortName: string;
  currentSprint: string | null;
  roadmapPath: string | null;
  sprints: SprintSummary[];
  artifacts: ArtifactSummary[];
  evaluation: EvaluationSummary | null;
  contractGate: ContractGateSummary;
  qaResult: QaResult | null;
  evaluationGate: EvaluationGateSummary;
  toolExecution: ToolExecutionSummary;
  localMemory: LocalMemorySummary;
  agents: AgentState[];
  progress: SprintProgressState | null;
  terminalEvents: TerminalEvent[];
};

export type ArtifactReadResponse = {
  path: string;
  kind: ArtifactKind;
  title: string;
  content: string;
};

export type ArtifactWriteResponse = {
  path: string;
  kind: "spec" | "sprint" | "contract";
  title: string;
  content: string;
  saved: true;
};

export type ContractGateSummary = {
  sprintId: string | null;
  contractPath: string | null;
  valid: boolean;
  buildBlocked: boolean;
  missingFields: string[];
  message: string;
};

export type WorkspaceErrorCode =
  | "workspace_not_found"
  | "artifact_not_found"
  | "invalid_artifact_path"
  | "invalid_artifact_content"
  | "invalid_agent_state"
  | "invalid_progress_state"
  | "invalid_event"
  | "invalid_qa_result"
  | "invalid_evaluation"
  | "invalid_tool_execution"
  | "missing_contract"
  | "qa_failed"
  | "evaluation_score_too_low"
  | "invalid_contract"
  | "missing_spec_reference"
  | "unsupported_artifact_type"
  | "read_failed"
  | "write_failed";

export class WorkspaceArtifactError extends Error {
  constructor(
    public readonly code: WorkspaceErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type ProjectMemory = {
  productName?: string;
  shortName?: string;
  currentSprint?: string;
};

const WORKSPACE_DIR = ".mcp-task";
const SUPPORTED_EXTENSIONS = new Set([".md", ".json", ".txt", ".log"]);
const REQUIRED_CONTRACT_FIELDS = [
  "sprint_id",
  "objective",
  "allowed_changes",
  "forbidden_changes",
  "acceptance_criteria",
  "qa_checklist",
  "expected_outputs",
  "rollback_notes",
] as const;

export function normalizeArtifactPath(inputPath: string): string {
  const normalizedSlashes = inputPath.replace(/\\/g, "/").trim();

  if (!normalizedSlashes) {
    throw new WorkspaceArtifactError("invalid_artifact_path", "Artifact path is required.", 400);
  }

  if (path.isAbsolute(normalizedSlashes) || /^[a-zA-Z]:\//.test(normalizedSlashes)) {
    throw new WorkspaceArtifactError("invalid_artifact_path", "Absolute artifact paths are not allowed.", 400);
  }

  const normalized = path.posix.normalize(normalizedSlashes);
  const segments = normalized.split("/");

  if (segments.includes("..") || normalized.startsWith("../")) {
    throw new WorkspaceArtifactError("invalid_artifact_path", "Path traversal is not allowed.", 400);
  }

  if (normalized !== WORKSPACE_DIR && !normalized.startsWith(`${WORKSPACE_DIR}/`)) {
    throw new WorkspaceArtifactError("invalid_artifact_path", "Artifact path must be inside .mcp-task/.", 400);
  }

  const extension = path.posix.extname(normalized).toLowerCase();
  if (extension && !SUPPORTED_EXTENSIONS.has(extension)) {
    throw new WorkspaceArtifactError("unsupported_artifact_type", "Artifact type is not supported.", 415);
  }

  return normalized;
}

export function resolveArtifactPath(repoRoot: string, artifactPath: string): string {
  const normalized = normalizeArtifactPath(artifactPath);
  const workspaceRoot = path.resolve(repoRoot, WORKSPACE_DIR);
  const resolved = path.resolve(repoRoot, normalized);
  const relative = path.relative(workspaceRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WorkspaceArtifactError("invalid_artifact_path", "Resolved path escapes .mcp-task/.", 400);
  }

  return resolved;
}

export function classifyArtifact(artifactPath: string): ArtifactKind {
  const normalized = normalizeArtifactPath(artifactPath);

  if (normalized === ".mcp-task/sprints/roadmap.md") return "roadmap";
  if (normalized.startsWith(".mcp-task/specs/")) return "spec";
  if (normalized.startsWith(".mcp-task/sprints/")) return "sprint";
  if (normalized.startsWith(".mcp-task/contracts/")) return "contract";
  if (normalized.startsWith(".mcp-task/evaluations/")) return "evaluation";
  if (normalized.startsWith(".mcp-task/qa/")) return "qa";
  if (normalized.startsWith(".mcp-task/logs/")) return "log";
  if (normalized.startsWith(".mcp-task/memory/")) return "memory";
  if (normalized.startsWith(".mcp-task/agents/")) return "agent";
  if (normalized.startsWith(".mcp-task/progress/")) return "progress";
  if (normalized.startsWith(".mcp-task/tools/")) return "tool";

  return "unknown";
}

export function titleFromArtifactPath(artifactPath: string): string {
  const basename = path.posix.basename(artifactPath).replace(/\.(md|json|txt|log)$/i, "");
  return basename
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function parseSprintSummary(artifactPath: string, content: string): SprintSummary {
  const titleMatch = content.match(/^#\s+Sprint\s+([A-Z]+-\d+)\s+-\s+(.+)$/im);
  const idFromFile = path.posix.basename(artifactPath).match(/sprint-(\d+)/i)?.[1];
  const statusMatch = content.match(/## Status\s+`?([a-z_]+)`?/i);

  return {
    id: titleMatch?.[1] ?? (idFromFile ? `SPRINT-${idFromFile.padStart(3, "0")}` : titleFromArtifactPath(artifactPath)),
    title: titleMatch?.[2]?.trim() ?? titleFromArtifactPath(artifactPath),
    status: toSprintStatus(statusMatch?.[1]),
    path: artifactPath,
  };
}

export function parseTerminalEvents(content: string, sourcePath?: string): TerminalEvent[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("mcp-task>"))
    .map((text) => ({
      level: text.includes("failed") || text.includes("error") ? "error" : text.includes("score") || text.includes("completed") ? "ok" : "info",
      text,
      sourcePath,
    }));
}

export async function buildWorkspaceSummary(repoRoot = process.cwd()): Promise<WorkspaceSummary> {
  const workspaceRoot = path.resolve(repoRoot, WORKSPACE_DIR);

  try {
    await access(workspaceRoot);
  } catch {
    throw new WorkspaceArtifactError("workspace_not_found", ".mcp-task workspace was not found.", 404);
  }

  const artifacts = await listWorkspaceArtifacts(repoRoot);
  const sprintArtifacts = artifacts.filter((artifact) => artifact.kind === "sprint");
  const sprints = await readSprintSummaries(repoRoot, sprintArtifacts);
  const memory = await readProjectMemory(repoRoot);
  const evaluation = await readLatestEvaluation(repoRoot, artifacts);
  const terminalEvents = await readTerminalEvents(repoRoot, artifacts);
  const currentSprint = memory.currentSprint ?? sprints[0]?.id ?? null;
  const contractGate = await readContractGate(repoRoot, artifacts, currentSprint);
  const agents = await readAgentStates(repoRoot);
  const progress = await readSprintProgress(repoRoot, currentSprint, agents);
  const qaResult = await readQaResult(repoRoot, currentSprint);
  const evaluationDocument = await readEvaluationDocument(repoRoot, currentSprint);
  const evaluationGate = buildEvaluationGate(currentSprint, qaResult, evaluationDocument);
  const toolExecution = summarizeToolExecution(await ensurePackageScriptProposals(repoRoot));
  const localMemory = summarizeLocalMemory(await buildLocalMemoryIndex(repoRoot));

  return {
    productName: memory.productName ?? "MCP Harness Task Manager",
    shortName: memory.shortName ?? "mcp-task",
    currentSprint,
    roadmapPath: artifacts.find((artifact) => artifact.kind === "roadmap")?.path ?? null,
    sprints,
    artifacts,
    evaluation,
    contractGate,
    qaResult,
    evaluationGate,
    toolExecution,
    localMemory,
    agents: progress?.agents.length ? progress.agents : agents,
    progress,
    terminalEvents: [...terminalEvents, ...terminalEventsFromProgress(progress)].length
      ? [...terminalEvents, ...terminalEventsFromProgress(progress)]
      : [{ level: "info", text: "mcp-task> no local log events found" }],
  };
}

export function validateAgentState(value: unknown): AgentState {
  const agent = value as Partial<AgentState>;
  const roles = new Set<AgentRole>(["Planner", "Contract", "Builder", "QA", "Architect", "Security", "Evaluator"]);
  const statuses = new Set<AgentStatus>(["idle", "active", "blocked", "complete", "failed"]);

  if (!agent || typeof agent !== "object" || typeof agent.name !== "string" || !agent.name.trim()) {
    throw new WorkspaceArtifactError("invalid_agent_state", "Agent name is required.", 400);
  }

  if (!roles.has(agent.role as AgentRole)) {
    throw new WorkspaceArtifactError("invalid_agent_state", "Agent role is invalid.", 400);
  }

  if (typeof agent.goal !== "string" || !agent.goal.trim()) {
    throw new WorkspaceArtifactError("invalid_agent_state", "Agent goal is required.", 400);
  }

  if (!statuses.has(agent.status as AgentStatus)) {
    throw new WorkspaceArtifactError("invalid_agent_state", "Agent status is invalid.", 400);
  }

  for (const field of ["allowed_actions", "forbidden_actions", "inputs", "outputs"] as const) {
    if (!Array.isArray(agent[field]) || !agent[field]?.every((item) => typeof item === "string")) {
      throw new WorkspaceArtifactError("invalid_agent_state", `Agent ${field} must be a string array.`, 400);
    }
  }

  const allowedActions = agent.allowed_actions as string[];
  const forbiddenActions = agent.forbidden_actions as string[];
  const inputs = agent.inputs as string[];
  const outputs = agent.outputs as string[];

  return {
    name: agent.name,
    role: agent.role as AgentRole,
    goal: agent.goal,
    allowed_actions: allowedActions,
    forbidden_actions: forbiddenActions,
    inputs,
    outputs,
    status: agent.status as AgentStatus,
  };
}

export function validateActivityEvent(value: unknown): ActivityEvent {
  const event = value as Partial<ActivityEvent>;
  const types = new Set<ActivityEventType>(["created", "started", "progressed", "blocked", "completed", "failed", "validated"]);

  if (!event || typeof event !== "object" || typeof event.id !== "string" || !event.id.trim()) {
    throw new WorkspaceArtifactError("invalid_event", "Event id is required.", 400);
  }

  if (typeof event.sprintId !== "string" || !event.sprintId.trim()) {
    throw new WorkspaceArtifactError("invalid_event", "Event sprintId is required.", 400);
  }

  if (typeof event.agent !== "string" || !event.agent.trim()) {
    throw new WorkspaceArtifactError("invalid_event", "Event agent is required.", 400);
  }

  if (!types.has(event.type as ActivityEventType)) {
    throw new WorkspaceArtifactError("invalid_event", "Event type is invalid.", 400);
  }

  if (typeof event.message !== "string" || !event.message.trim()) {
    throw new WorkspaceArtifactError("invalid_event", "Event message is required.", 400);
  }

  if (typeof event.timestamp !== "string" || Number.isNaN(Date.parse(event.timestamp))) {
    throw new WorkspaceArtifactError("invalid_event", "Event timestamp must be an ISO date string.", 400);
  }

  if (event.artifactPath) {
    normalizeArtifactPath(event.artifactPath);
  }

  return {
    id: event.id,
    sprintId: event.sprintId,
    agent: event.agent,
    type: event.type as ActivityEventType,
    message: event.message,
    timestamp: event.timestamp,
    artifactPath: event.artifactPath,
  };
}

export function validateSprintProgressState(value: unknown, fallbackAgents: AgentState[] = []): SprintProgressState {
  const progress = value as Partial<SprintProgressState>;
  const stages = new Set<PipelineStage>(["SPEC", "Contract", "Build", "QA", "Evaluation", "Done"]);
  const statuses = new Set<SprintStatus>(["planned", "contract_ready", "building", "qa_running", "failed", "passed", "done"]);

  if (!progress || typeof progress !== "object" || typeof progress.sprintId !== "string" || !progress.sprintId.trim()) {
    throw new WorkspaceArtifactError("invalid_progress_state", "Progress sprintId is required.", 400);
  }

  if (!stages.has(progress.stage as PipelineStage)) {
    throw new WorkspaceArtifactError("invalid_progress_state", "Progress stage is invalid.", 400);
  }

  if (!statuses.has(progress.status as SprintStatus)) {
    throw new WorkspaceArtifactError("invalid_progress_state", "Progress status is invalid.", 400);
  }

  if (typeof progress.updatedAt !== "string" || Number.isNaN(Date.parse(progress.updatedAt))) {
    throw new WorkspaceArtifactError("invalid_progress_state", "Progress updatedAt must be an ISO date string.", 400);
  }

  const agents = Array.isArray(progress.agents) ? progress.agents.map(validateAgentState) : fallbackAgents;
  const events = Array.isArray(progress.events) ? progress.events.map(validateActivityEvent) : [];

  return {
    sprintId: progress.sprintId,
    stage: progress.stage as PipelineStage,
    status: progress.status as SprintStatus,
    agents,
    events,
    updatedAt: progress.updatedAt,
  };
}

export function validateQaItem(value: unknown): QaItem {
  const item = value as Partial<QaItem>;
  const statuses = new Set<QaItemStatus>(["passed", "failed", "pending"]);

  if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim()) {
    throw new WorkspaceArtifactError("invalid_qa_result", "QA item id is required.", 400);
  }

  if (typeof item.label !== "string" || !item.label.trim()) {
    throw new WorkspaceArtifactError("invalid_qa_result", "QA item label is required.", 400);
  }

  if (!statuses.has(item.status as QaItemStatus)) {
    throw new WorkspaceArtifactError("invalid_qa_result", "QA item status is invalid.", 400);
  }

  return {
    id: item.id,
    label: item.label,
    status: item.status as QaItemStatus,
    evidence: item.evidence,
    failureReason: item.failureReason,
  };
}

export function validateQaResult(value: unknown): QaResult {
  const result = value as Partial<QaResult>;
  const statuses = new Set<QaResultStatus>(["passed", "failed", "pending"]);

  if (!result || typeof result !== "object" || typeof result.sprintId !== "string" || !result.sprintId.trim()) {
    throw new WorkspaceArtifactError("invalid_qa_result", "QA sprintId is required.", 400);
  }

  if (typeof result.contractPath !== "string") {
    throw new WorkspaceArtifactError("missing_contract", "QA result must reference a Contract.", 400);
  }

  const normalizedContractPath = normalizeArtifactPath(result.contractPath);
  if (!normalizedContractPath.startsWith(".mcp-task/contracts/")) {
    throw new WorkspaceArtifactError("invalid_artifact_path", "QA contractPath must be inside .mcp-task/contracts/.", 400);
  }

  if (!statuses.has(result.status as QaResultStatus)) {
    throw new WorkspaceArtifactError("invalid_qa_result", "QA status is invalid.", 400);
  }

  if (!Array.isArray(result.items) || result.items.length === 0) {
    throw new WorkspaceArtifactError("invalid_qa_result", "QA items are required.", 400);
  }

  if (typeof result.validatedAt !== "string" || Number.isNaN(Date.parse(result.validatedAt))) {
    throw new WorkspaceArtifactError("invalid_qa_result", "QA validatedAt must be an ISO date string.", 400);
  }

  const items = result.items.map(validateQaItem);
  const derivedStatus: QaResultStatus = items.some((item) => item.status === "failed")
    ? "failed"
    : items.some((item) => item.status === "pending")
      ? "pending"
      : "passed";

  if (result.status !== derivedStatus) {
    throw new WorkspaceArtifactError("invalid_qa_result", "QA status must match item statuses.", 400, {
      expectedStatus: derivedStatus,
      receivedStatus: result.status,
    });
  }

  return {
    sprintId: result.sprintId,
    contractPath: normalizedContractPath,
    status: result.status as QaResultStatus,
    items,
    validatedAt: result.validatedAt,
  };
}

export function validateEvaluationDocument(value: unknown, qaResult?: QaResult | null): EvaluationDocument {
  const evaluation = value as Partial<EvaluationDocument>;

  if (!evaluation || typeof evaluation !== "object" || typeof evaluation.sprintId !== "string" || !evaluation.sprintId.trim()) {
    throw new WorkspaceArtifactError("invalid_evaluation", "Evaluation sprintId is required.", 400);
  }

  if (evaluation.status !== "passed" && evaluation.status !== "failed") {
    throw new WorkspaceArtifactError("invalid_evaluation", "Evaluation status is invalid.", 400);
  }

  if (typeof evaluation.score !== "number" || evaluation.score < 0 || evaluation.score > 100) {
    throw new WorkspaceArtifactError("invalid_evaluation", "Evaluation score must be between 0 and 100.", 400);
  }

  const checks = evaluation.checks as EvaluationDocument["checks"] | undefined;
  const requiredChecks: Array<keyof EvaluationDocument["checks"]> = [
    "contractCompliance",
    "architecture",
    "simplicity",
    "offlineSupport",
    "uiConsistency",
    "validation",
  ];

  if (!checks || requiredChecks.some((check) => typeof checks[check] !== "boolean")) {
    throw new WorkspaceArtifactError("invalid_evaluation", "Evaluation checks are incomplete.", 400);
  }

  if (!Array.isArray(evaluation.failures) || !evaluation.failures.every((item) => typeof item === "string")) {
    throw new WorkspaceArtifactError("invalid_evaluation", "Evaluation failures must be a string array.", 400);
  }

  if (!Array.isArray(evaluation.recommendations) || !evaluation.recommendations.every((item) => typeof item === "string")) {
    throw new WorkspaceArtifactError("invalid_evaluation", "Evaluation recommendations must be a string array.", 400);
  }

  if (qaResult?.status === "failed" && evaluation.status === "passed") {
    throw new WorkspaceArtifactError("qa_failed", "Evaluation cannot pass when QA failed.", 400);
  }

  if (evaluation.status === "passed" && evaluation.score < 90) {
    throw new WorkspaceArtifactError("evaluation_score_too_low", "Evaluation score must be at least 90 to pass.", 400);
  }

  return {
    sprintId: evaluation.sprintId,
    status: evaluation.status,
    score: evaluation.score,
    checks,
    failures: evaluation.failures,
    recommendations: evaluation.recommendations,
  };
}

function terminalEventsFromProgress(progress: SprintProgressState | null): TerminalEvent[] {
  return progress
    ? progress.events.map((event) => ({
        level: event.type === "failed" ? "error" : event.type === "blocked" ? "warn" : event.type === "completed" || event.type === "validated" ? "ok" : "info",
        text: `mcp-task> ${event.agent}: ${event.message}`,
        sourcePath: event.artifactPath,
      }))
    : [];
}

function fallbackAgentStates(): AgentState[] {
  return [
    {
      name: "Planner",
      role: "Planner",
      goal: "Define sprint scope and keep SPEC current.",
      allowed_actions: ["read_specs", "update_sprint_plan"],
      forbidden_actions: ["implement_code"],
      inputs: ["SPEC", "roadmap"],
      outputs: ["sprint_plan"],
      status: "complete",
    },
    {
      name: "Contract",
      role: "Contract",
      goal: "Define Builder and QA guardrails.",
      allowed_actions: ["create_contract", "validate_contract"],
      forbidden_actions: ["execute_build"],
      inputs: ["SPEC", "sprint_plan"],
      outputs: ["contract"],
      status: "complete",
    },
    {
      name: "Builder",
      role: "Builder",
      goal: "Implement only Contract-approved scope.",
      allowed_actions: ["edit_allowed_files"],
      forbidden_actions: ["self_validate_completion"],
      inputs: ["contract"],
      outputs: ["implementation"],
      status: "idle",
    },
    {
      name: "QA",
      role: "QA",
      goal: "Validate each Contract checklist item.",
      allowed_actions: ["run_validation", "report_failures"],
      forbidden_actions: ["expand_scope"],
      inputs: ["contract", "implementation"],
      outputs: ["qa_result"],
      status: "idle",
    },
    {
      name: "Evaluator",
      role: "Evaluator",
      goal: "Score sprint outcome after QA.",
      allowed_actions: ["score_sprint", "record_evaluation"],
      forbidden_actions: ["skip_qa"],
      inputs: ["qa_result"],
      outputs: ["evaluation"],
      status: "idle",
    },
  ];
}

async function readAgentStates(repoRoot: string): Promise<AgentState[]> {
  try {
    const content = await readFile(resolveArtifactPath(repoRoot, ".mcp-task/agents/agents.json"), "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      throw new WorkspaceArtifactError("invalid_agent_state", "Agents file must contain an array.", 400);
    }
    return parsed.map(validateAgentState);
  } catch (error) {
    if (error instanceof WorkspaceArtifactError && error.code === "invalid_agent_state") throw error;
    return fallbackAgentStates();
  }
}

async function readSprintProgress(repoRoot: string, currentSprint: string | null, agents: AgentState[]): Promise<SprintProgressState | null> {
  if (!currentSprint) return null;

  const sprintNumber = currentSprint.match(/\d+/)?.[0]?.padStart(3, "0");
  const progressPath = `.mcp-task/progress/sprint-${sprintNumber}.json`;

  try {
    const content = await readFile(resolveArtifactPath(repoRoot, progressPath), "utf8");
    return validateSprintProgressState(JSON.parse(content) as unknown, agents);
  } catch (error) {
    if (error instanceof WorkspaceArtifactError && (error.code === "invalid_progress_state" || error.code === "invalid_event")) throw error;
    return null;
  }
}

async function readQaResult(repoRoot: string, currentSprint: string | null): Promise<QaResult | null> {
  if (!currentSprint) return null;

  const sprintNumber = currentSprint.match(/\d+/)?.[0]?.padStart(3, "0");
  const qaPath = `.mcp-task/qa/sprint-${sprintNumber}-qa.json`;

  try {
    const content = await readFile(resolveArtifactPath(repoRoot, qaPath), "utf8");
    return validateQaResult(JSON.parse(content) as unknown);
  } catch (error) {
    if (error instanceof WorkspaceArtifactError && ["invalid_qa_result", "missing_contract", "invalid_artifact_path"].includes(error.code)) throw error;
    return null;
  }
}

async function readEvaluationDocument(repoRoot: string, currentSprint: string | null): Promise<EvaluationDocument | null> {
  if (!currentSprint) return null;

  const sprintNumber = currentSprint.match(/\d+/)?.[0]?.padStart(3, "0");
  const evaluationPath = `.mcp-task/evaluations/sprint-${sprintNumber}-evaluation.json`;
  const qaResult = await readQaResult(repoRoot, currentSprint);

  try {
    const content = await readFile(resolveArtifactPath(repoRoot, evaluationPath), "utf8");
    return validateEvaluationDocument(JSON.parse(content) as unknown, qaResult);
  } catch (error) {
    if (error instanceof WorkspaceArtifactError && ["invalid_evaluation", "qa_failed", "evaluation_score_too_low"].includes(error.code)) throw error;
    return null;
  }
}

function buildEvaluationGate(currentSprint: string | null, qaResult: QaResult | null, evaluation: EvaluationDocument | null): EvaluationGateSummary {
  if (!currentSprint) {
    return {
      sprintId: null,
      passed: false,
      doneBlocked: true,
      message: "No current sprint is selected.",
      score: null,
      qaStatus: "missing",
    };
  }

  if (!qaResult) {
    return {
      sprintId: currentSprint,
      passed: false,
      doneBlocked: true,
      message: "QA result is required before Evaluation.",
      score: evaluation?.score ?? null,
      qaStatus: "missing",
    };
  }

  if (qaResult.status !== "passed") {
    return {
      sprintId: currentSprint,
      passed: false,
      doneBlocked: true,
      message: "QA failed or is pending. Sprint must return to Build.",
      score: evaluation?.score ?? null,
      qaStatus: qaResult.status,
    };
  }

  if (!evaluation) {
    return {
      sprintId: currentSprint,
      passed: false,
      doneBlocked: true,
      message: "Evaluation is required after QA passes.",
      score: null,
      qaStatus: qaResult.status,
    };
  }

  const passed = evaluation.status === "passed" && evaluation.score >= 90;
  return {
    sprintId: currentSprint,
    passed,
    doneBlocked: !passed,
    message: passed ? "QA and Evaluation passed. Sprint can be passed." : "Evaluation score is below the required threshold.",
    score: evaluation.score,
    qaStatus: qaResult.status,
  };
}

export async function readWorkspaceArtifact(repoRoot: string, artifactPath: string): Promise<ArtifactReadResponse> {
  const normalized = normalizeArtifactPath(artifactPath);
  const resolved = resolveArtifactPath(repoRoot, normalized);

  try {
    const content = await readFile(resolved, "utf8");
    return {
      path: normalized,
      kind: classifyArtifact(normalized),
      title: titleFromArtifactPath(normalized),
      content,
    };
  } catch {
    throw new WorkspaceArtifactError("artifact_not_found", "Artifact was not found.", 404);
  }
}

export function validateWritableArtifactPath(artifactPath: string): "spec" | "sprint" | "contract" {
  const normalized = normalizeArtifactPath(artifactPath);
  const extension = path.posix.extname(normalized).toLowerCase();
  const isSpecPath = normalized.startsWith(".mcp-task/specs/");
  const isSprintPath = normalized.startsWith(".mcp-task/sprints/") && normalized !== ".mcp-task/sprints/roadmap.md";
  const isContractPath = normalized.startsWith(".mcp-task/contracts/");

  if (!isSpecPath && !isSprintPath && !isContractPath) {
    throw new WorkspaceArtifactError(
      "invalid_artifact_path",
      "Writes are allowed only for .mcp-task/specs/, .mcp-task/sprints/ and .mcp-task/contracts/ Markdown files.",
      400,
    );
  }

  if (extension !== ".md") {
    throw new WorkspaceArtifactError("unsupported_artifact_type", "Only Markdown artifacts can be edited.", 415);
  }

  if (isSpecPath) return "spec";
  if (isSprintPath) return "sprint";
  return "contract";
}

export function validateArtifactContent(content: unknown): string {
  if (typeof content !== "string") {
    throw new WorkspaceArtifactError("invalid_artifact_content", "Artifact content must be a string.", 400);
  }

  if (!content.trim()) {
    throw new WorkspaceArtifactError("invalid_artifact_content", "Artifact content cannot be empty.", 400);
  }

  if (content.length > 200_000) {
    throw new WorkspaceArtifactError("invalid_artifact_content", "Artifact content is too large.", 413);
  }

  return content.replace(/\r\n/g, "\n");
}

export function validateSprintSpecReference(content: string, specPath?: string): string {
  const normalizedSpecPath = specPath ? normalizeArtifactPath(specPath) : "";

  if (!normalizedSpecPath.startsWith(".mcp-task/specs/") || path.posix.extname(normalizedSpecPath).toLowerCase() !== ".md") {
    throw new WorkspaceArtifactError("missing_spec_reference", "Sprint plans must reference a Markdown SPEC inside .mcp-task/specs/.", 400);
  }

  if (!content.includes(normalizedSpecPath)) {
    throw new WorkspaceArtifactError("missing_spec_reference", "Sprint plan content must include the referenced SPEC path.", 400);
  }

  return normalizedSpecPath;
}

export function validateContractContent(content: string, sprintId?: string): { valid: boolean; missingFields: string[] } {
  const missingFields = REQUIRED_CONTRACT_FIELDS.filter((field) => !contractFieldExists(content, field));

  if (sprintId && !content.includes(sprintId)) {
    missingFields.push("sprint_id");
  }

  return {
    valid: missingFields.length === 0,
    missingFields: Array.from(new Set(missingFields)),
  };
}

export async function writeWorkspaceArtifact(
  repoRoot: string,
  artifactPath: string,
  contentInput: unknown,
  specPath?: string,
): Promise<ArtifactWriteResponse> {
  const normalized = normalizeArtifactPath(artifactPath);
  const kind = validateWritableArtifactPath(normalized);
  const content = validateArtifactContent(contentInput);
  const resolved = resolveArtifactPath(repoRoot, normalized);

  if (kind === "sprint") {
    const normalizedSpecPath = validateSprintSpecReference(content, specPath);
    await assertArtifactExists(repoRoot, normalizedSpecPath, "Referenced SPEC was not found.");
  }

  if (kind === "contract") {
    const sprintId = sprintIdFromContractPath(normalized);
    const validation = validateContractContent(content, sprintId);
    if (!validation.valid) {
      throw new WorkspaceArtifactError("invalid_contract", "Contract is missing required fields.", 400, {
        missingFields: validation.missingFields,
      });
    }
  }

  try {
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, content.endsWith("\n") ? content : `${content}\n`, "utf8");
    await appendAuthoringEvent(repoRoot, `mcp-task> saved ${kind} artifact ${normalized}`);

    return {
      path: normalized,
      kind,
      title: titleFromArtifactPath(normalized),
      content: content.endsWith("\n") ? content : `${content}\n`,
      saved: true,
    };
  } catch (error) {
    if (error instanceof WorkspaceArtifactError) throw error;
    throw new WorkspaceArtifactError("write_failed", "Failed to write workspace artifact.", 500);
  }
}

export async function recordProgressEvent(repoRoot: string, eventInput: unknown): Promise<SprintProgressState> {
  const event = validateActivityEvent(eventInput);
  const agents = await readAgentStates(repoRoot);
  const existing = await readSprintProgress(repoRoot, event.sprintId, agents);
  const progress = existing ?? {
    sprintId: event.sprintId,
    stage: "Build" as PipelineStage,
    status: "building" as SprintStatus,
    agents,
    events: [],
    updatedAt: event.timestamp,
  };
  const updated: SprintProgressState = {
    ...progress,
    events: [...progress.events, event],
    updatedAt: event.timestamp,
  };
  const sprintNumber = event.sprintId.match(/\d+/)?.[0]?.padStart(3, "0");
  const progressPath = resolveArtifactPath(repoRoot, `.mcp-task/progress/sprint-${sprintNumber}.json`);

  try {
    await mkdir(path.dirname(progressPath), { recursive: true });
    await writeFile(progressPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    await appendAuthoringEvent(repoRoot, `mcp-task> ${event.agent}: ${event.message}`);
    return updated;
  } catch (error) {
    if (error instanceof WorkspaceArtifactError) throw error;
    throw new WorkspaceArtifactError("write_failed", "Failed to write progress event.", 500);
  }
}

async function listWorkspaceArtifacts(repoRoot: string): Promise<ArtifactSummary[]> {
  const folders: Array<{ dir: string; kind: ArtifactKind }> = [
    { dir: "specs", kind: "spec" },
    { dir: "sprints", kind: "sprint" },
    { dir: "contracts", kind: "contract" },
    { dir: "evaluations", kind: "evaluation" },
    { dir: "qa", kind: "qa" },
    { dir: "logs", kind: "log" },
    { dir: "memory", kind: "memory" },
    { dir: "agents", kind: "agent" },
    { dir: "progress", kind: "progress" },
    { dir: "tools", kind: "tool" },
  ];

  const artifacts: ArtifactSummary[] = [];

  for (const folder of folders) {
    const absoluteDir = path.resolve(repoRoot, WORKSPACE_DIR, folder.dir);
    let entries: string[] = [];

    try {
      entries = await readdir(absoluteDir);
    } catch {
      continue;
    }

    for (const entry of entries.sort()) {
      const artifactPath = `${WORKSPACE_DIR}/${folder.dir}/${entry}`;
      const extension = path.posix.extname(artifactPath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension)) continue;

      const kind = artifactPath === ".mcp-task/sprints/roadmap.md" ? "roadmap" : folder.kind;
      artifacts.push({
        path: artifactPath,
        kind,
        title: titleFromArtifactPath(artifactPath),
      });
    }
  }

  return artifacts;
}

async function assertArtifactExists(repoRoot: string, artifactPath: string, message: string): Promise<void> {
  try {
    await access(resolveArtifactPath(repoRoot, artifactPath));
  } catch {
    throw new WorkspaceArtifactError("artifact_not_found", message, 404);
  }
}

async function appendAuthoringEvent(repoRoot: string, text: string): Promise<void> {
  const memory = await readProjectMemory(repoRoot);
  const sprintNumber = memory.currentSprint?.match(/\d+/)?.[0]?.padStart(3, "0") ?? "005";
  const logPath = resolveArtifactPath(repoRoot, `.mcp-task/logs/sprint-${sprintNumber}.md`);
  const line = `${text}\n`;

  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, line, "utf8");
  } catch {
    throw new WorkspaceArtifactError("write_failed", "Failed to record authoring event.", 500);
  }
}

async function readContractGate(repoRoot: string, artifacts: ArtifactSummary[], currentSprint: string | null): Promise<ContractGateSummary> {
  if (!currentSprint) {
    return {
      sprintId: null,
      contractPath: null,
      valid: false,
      buildBlocked: true,
      missingFields: ["sprint_id"],
      message: "No current sprint is selected.",
    };
  }

  const contractArtifact = artifacts.find(
    (artifact) => artifact.kind === "contract" && artifact.path.includes(currentSprint.toLowerCase()),
  );

  if (!contractArtifact) {
    return {
      sprintId: currentSprint,
      contractPath: null,
      valid: false,
      buildBlocked: true,
      missingFields: REQUIRED_CONTRACT_FIELDS.slice(),
      message: "Build is blocked until a valid sprint Contract exists.",
    };
  }

  try {
    const content = await readFile(resolveArtifactPath(repoRoot, contractArtifact.path), "utf8");
    const validation = validateContractContent(content, currentSprint);
    return {
      sprintId: currentSprint,
      contractPath: contractArtifact.path,
      valid: validation.valid,
      buildBlocked: !validation.valid,
      missingFields: validation.missingFields,
      message: validation.valid ? "Contract is valid. Build can start." : "Build is blocked by an invalid Contract.",
    };
  } catch {
    return {
      sprintId: currentSprint,
      contractPath: contractArtifact.path,
      valid: false,
      buildBlocked: true,
      missingFields: REQUIRED_CONTRACT_FIELDS.slice(),
      message: "Build is blocked because the Contract could not be read.",
    };
  }
}

function contractFieldExists(content: string, field: string): boolean {
  const escaped = field.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const headingPattern = new RegExp(`^#{2,6}\\s+${escaped}\\s*$`, "im");
  const listPattern = new RegExp(`^[-*]\\s+${escaped}\\s*:`, "im");
  return headingPattern.test(content) || listPattern.test(content);
}

function sprintIdFromContractPath(contractPath: string): string | undefined {
  const match = path.posix.basename(contractPath).match(/sprint-(\d+)/i);
  return match ? `SPRINT-${match[1].padStart(3, "0")}` : undefined;
}

async function readSprintSummaries(repoRoot: string, sprintArtifacts: ArtifactSummary[]): Promise<SprintSummary[]> {
  const sprints: SprintSummary[] = [];

  for (const artifact of sprintArtifacts) {
    if (artifact.kind === "roadmap") continue;

    try {
      const content = await readFile(resolveArtifactPath(repoRoot, artifact.path), "utf8");
      sprints.push(parseSprintSummary(artifact.path, content));
    } catch {
      sprints.push({
        id: titleFromArtifactPath(artifact.path),
        title: artifact.title,
        status: "planned",
        path: artifact.path,
      });
    }
  }

  return sprints.sort((a, b) => a.id.localeCompare(b.id));
}

async function readProjectMemory(repoRoot: string): Promise<ProjectMemory> {
  try {
    const content = await readFile(resolveArtifactPath(repoRoot, ".mcp-task/memory/project.json"), "utf8");
    return JSON.parse(content) as ProjectMemory;
  } catch {
    return {};
  }
}

async function readLatestEvaluation(repoRoot: string, artifacts: ArtifactSummary[]): Promise<EvaluationSummary | null> {
  const evaluationArtifacts = artifacts
    .filter((artifact) => artifact.kind === "evaluation")
    .sort((a, b) => b.path.localeCompare(a.path));

  for (const artifact of evaluationArtifacts) {
    try {
      const content = await readFile(resolveArtifactPath(repoRoot, artifact.path), "utf8");
      const parsed = JSON.parse(content) as Partial<EvaluationSummary>;
      if (parsed.sprintId && typeof parsed.score === "number" && (parsed.status === "passed" || parsed.status === "failed")) {
        return {
          sprintId: parsed.sprintId,
          status: parsed.status,
          score: parsed.score,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function readTerminalEvents(repoRoot: string, artifacts: ArtifactSummary[]): Promise<TerminalEvent[]> {
  const events: TerminalEvent[] = [];
  const logArtifacts = artifacts.filter((artifact) => artifact.kind === "log");

  for (const artifact of logArtifacts) {
    try {
      const content = await readFile(resolveArtifactPath(repoRoot, artifact.path), "utf8");
      events.push(...parseTerminalEvents(content, artifact.path));
    } catch {
      events.push({
        level: "warn",
        text: `mcp-task> failed to read log ${artifact.path}`,
        sourcePath: artifact.path,
      });
    }
  }

  return events;
}

function toSprintStatus(value?: string): SprintStatus {
  const statuses = new Set<SprintStatus>(["planned", "contract_ready", "building", "qa_running", "failed", "passed", "done"]);
  return value && statuses.has(value as SprintStatus) ? (value as SprintStatus) : "planned";
}
