import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type McpToolCategory = "validation" | "filesystem" | "agent" | "external" | "other";
export type ToolExecutionStatus = "proposed" | "approved" | "rejected" | "executed" | "failed";
export type CommandSource = "package-script" | "contract" | "qa" | "manual";
export type CommandRiskLevel = "low" | "medium" | "high" | "blocked";

export type McpTool = {
  id: string;
  name: string;
  description: string;
  category: McpToolCategory;
  enabled: boolean;
  requiresApproval: boolean;
};

export type McpToolCall = {
  id: string;
  toolId: string;
  requestedByAgent: string;
  input: Record<string, unknown>;
  status: ToolExecutionStatus;
  createdAt: string;
  approvedAt?: string;
  executedAt?: string;
};

export type McpToolResult = {
  callId: string;
  ok: boolean;
  output?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
  completedAt: string;
};

export type CommandProposal = {
  id: string;
  label: string;
  command: string;
  args: string[];
  source: CommandSource;
  riskLevel: CommandRiskLevel;
  status: ToolExecutionStatus;
  createdAt: string;
  approvedAt?: string;
};

export type CommandExecutionResult = {
  proposalId: string;
  exitCode: number | null;
  stdoutPreview: string;
  stderrPreview: string;
  startedAt: string;
  completedAt: string;
};

export type ToolExecutionState = {
  sprintId: string;
  commands: CommandProposal[];
  toolCalls: McpToolCall[];
  results: CommandExecutionResult[];
};

export type ToolExecutionSummary = ToolExecutionState & {
  counts: Record<ToolExecutionStatus, number>;
  failedCommands: CommandProposal[];
  approvalRequiredCount: number;
};

export type PackageScriptMap = Record<string, string>;

const WORKSPACE_DIR = ".mcp-task";
const STATE_PATH = ".mcp-task/tools/sprint-007-tool-execution.json";
const OUTPUT_PREVIEW_LIMIT = 4000;
const VALIDATION_SCRIPT_HINTS = ["build", "test", "check", "lint", "typecheck", "golden"];
const BLOCKED_COMMAND_PATTERNS = [
  /\brm\b/i,
  /\bdel\b/i,
  /\brmdir\b/i,
  /\bremove-item\b/i,
  /\bgit\s+reset\b/i,
  /\bgit\s+clean\b/i,
  /\bformat\b/i,
  /\bshutdown\b/i,
  /\btaskkill\b/i,
];

const HIGH_RISK_PATTERNS = [/\b--force\b/i, /\b-f\b/i, /\bkill\b/i, /\bchmod\b/i, /\bchown\b/i];

export function defaultToolExecutionState(sprintId = "SPRINT-007"): ToolExecutionState {
  return {
    sprintId,
    commands: [],
    toolCalls: [
      {
        id: "tool-call-validation-registry",
        toolId: "validation-command-registry",
        requestedByAgent: "QA",
        input: { purpose: "List safe validation presets from package.json" },
        status: "proposed",
        createdAt: "2026-06-13T21:00:00.000Z",
      },
    ],
    results: [],
  };
}

export function defaultMcpTools(): McpTool[] {
  return [
    {
      id: "validation-command-registry",
      name: "Validation Command Registry",
      description: "Reads local package scripts and proposes explicit validation commands.",
      category: "validation",
      enabled: true,
      requiresApproval: false,
    },
    {
      id: "local-command-runner",
      name: "Local Command Runner",
      description: "Runs approved local validation commands and records bounded output.",
      category: "validation",
      enabled: true,
      requiresApproval: true,
    },
  ];
}

export function validateMcpTool(value: unknown): McpTool {
  const tool = value as Partial<McpTool>;
  const categories = new Set<McpToolCategory>(["validation", "filesystem", "agent", "external", "other"]);

  if (!tool || typeof tool !== "object" || typeof tool.id !== "string" || !tool.id.trim()) {
    throw new Error("McpTool id is required.");
  }

  if (typeof tool.name !== "string" || !tool.name.trim()) {
    throw new Error("McpTool name is required.");
  }

  if (typeof tool.description !== "string") {
    throw new Error("McpTool description is required.");
  }

  if (!categories.has(tool.category as McpToolCategory)) {
    throw new Error("McpTool category is invalid.");
  }

  if (typeof tool.enabled !== "boolean" || typeof tool.requiresApproval !== "boolean") {
    throw new Error("McpTool booleans are required.");
  }

  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    category: tool.category as McpToolCategory,
    enabled: tool.enabled,
    requiresApproval: tool.requiresApproval,
  };
}

export function validateMcpToolCall(value: unknown, tools = defaultMcpTools()): McpToolCall {
  const call = value as Partial<McpToolCall>;
  const statuses = new Set<ToolExecutionStatus>(["proposed", "approved", "rejected", "executed", "failed"]);
  const toolIds = new Set(tools.map((tool) => tool.id));

  if (!call || typeof call !== "object" || typeof call.id !== "string" || !call.id.trim()) {
    throw new Error("McpToolCall id is required.");
  }

  if (typeof call.toolId !== "string" || !toolIds.has(call.toolId)) {
    throw new Error("McpToolCall toolId must reference a registered tool.");
  }

  if (typeof call.requestedByAgent !== "string" || !call.requestedByAgent.trim()) {
    throw new Error("McpToolCall requestedByAgent is required.");
  }

  if (!call.input || typeof call.input !== "object" || Array.isArray(call.input)) {
    throw new Error("McpToolCall input must be an object.");
  }

  if (!statuses.has(call.status as ToolExecutionStatus)) {
    throw new Error("McpToolCall status is invalid.");
  }

  if (typeof call.createdAt !== "string" || Number.isNaN(Date.parse(call.createdAt))) {
    throw new Error("McpToolCall createdAt must be an ISO date string.");
  }

  if (call.status === "executed" && (!call.approvedAt || !call.executedAt)) {
    throw new Error("Executed McpToolCall requires approvedAt and executedAt.");
  }

  JSON.stringify(call.input);

  return {
    id: call.id,
    toolId: call.toolId,
    requestedByAgent: call.requestedByAgent,
    input: call.input as Record<string, unknown>,
    status: call.status as ToolExecutionStatus,
    createdAt: call.createdAt,
    approvedAt: call.approvedAt,
    executedAt: call.executedAt,
  };
}

export function validateMcpToolResult(value: unknown): McpToolResult {
  const result = value as Partial<McpToolResult>;

  if (!result || typeof result !== "object" || typeof result.callId !== "string" || !result.callId.trim()) {
    throw new Error("McpToolResult callId is required.");
  }

  if (typeof result.ok !== "boolean") {
    throw new Error("McpToolResult ok is required.");
  }

  if (result.ok && result.error) {
    throw new Error("Successful McpToolResult cannot include error.");
  }

  if (!result.ok && (!result.error || typeof result.error.code !== "string" || typeof result.error.message !== "string")) {
    throw new Error("Failed McpToolResult requires error.");
  }

  if (typeof result.completedAt !== "string" || Number.isNaN(Date.parse(result.completedAt))) {
    throw new Error("McpToolResult completedAt must be an ISO date string.");
  }

  return {
    callId: result.callId,
    ok: result.ok,
    output: result.output,
    error: result.error,
    completedAt: result.completedAt,
  };
}

export function validateCommandProposal(value: unknown): CommandProposal {
  const proposal = value as Partial<CommandProposal>;
  const sources = new Set<CommandSource>(["package-script", "contract", "qa", "manual"]);
  const risks = new Set<CommandRiskLevel>(["low", "medium", "high", "blocked"]);
  const statuses = new Set<ToolExecutionStatus>(["proposed", "approved", "rejected", "executed", "failed"]);

  if (!proposal || typeof proposal !== "object" || typeof proposal.id !== "string" || !proposal.id.trim()) {
    throw new Error("CommandProposal id is required.");
  }

  if (typeof proposal.label !== "string" || !proposal.label.trim()) {
    throw new Error("CommandProposal label is required.");
  }

  if (typeof proposal.command !== "string" || !proposal.command.trim()) {
    throw new Error("CommandProposal command is required.");
  }

  if (!Array.isArray(proposal.args) || !proposal.args.every((arg) => typeof arg === "string")) {
    throw new Error("CommandProposal args must be a string array.");
  }

  if (!sources.has(proposal.source as CommandSource)) {
    throw new Error("CommandProposal source is invalid.");
  }

  if (!risks.has(proposal.riskLevel as CommandRiskLevel)) {
    throw new Error("CommandProposal riskLevel is invalid.");
  }

  if (!statuses.has(proposal.status as ToolExecutionStatus)) {
    throw new Error("CommandProposal status is invalid.");
  }

  if (proposal.riskLevel === "blocked" && proposal.status === "approved") {
    throw new Error("Blocked command cannot be approved.");
  }

  if (typeof proposal.createdAt !== "string" || Number.isNaN(Date.parse(proposal.createdAt))) {
    throw new Error("CommandProposal createdAt must be an ISO date string.");
  }

  if (proposal.status === "approved" && !proposal.approvedAt) {
    throw new Error("Approved command requires approvedAt.");
  }

  return {
    id: proposal.id,
    label: proposal.label,
    command: proposal.command,
    args: proposal.args,
    source: proposal.source as CommandSource,
    riskLevel: proposal.riskLevel as CommandRiskLevel,
    status: proposal.status as ToolExecutionStatus,
    createdAt: proposal.createdAt,
    approvedAt: proposal.approvedAt,
  };
}

export function validateCommandExecutionResult(value: unknown): CommandExecutionResult {
  const result = value as Partial<CommandExecutionResult>;

  if (!result || typeof result !== "object" || typeof result.proposalId !== "string" || !result.proposalId.trim()) {
    throw new Error("CommandExecutionResult proposalId is required.");
  }

  if (typeof result.exitCode !== "number" && result.exitCode !== null) {
    throw new Error("CommandExecutionResult exitCode must be a number or null.");
  }

  if (typeof result.stdoutPreview !== "string" || typeof result.stderrPreview !== "string") {
    throw new Error("CommandExecutionResult output previews are required.");
  }

  if (result.stdoutPreview.length > OUTPUT_PREVIEW_LIMIT || result.stderrPreview.length > OUTPUT_PREVIEW_LIMIT) {
    throw new Error("CommandExecutionResult previews exceed limit.");
  }

  if (typeof result.startedAt !== "string" || Number.isNaN(Date.parse(result.startedAt))) {
    throw new Error("CommandExecutionResult startedAt must be an ISO date string.");
  }

  if (typeof result.completedAt !== "string" || Number.isNaN(Date.parse(result.completedAt))) {
    throw new Error("CommandExecutionResult completedAt must be an ISO date string.");
  }

  return {
    proposalId: result.proposalId,
    exitCode: result.exitCode,
    stdoutPreview: result.stdoutPreview,
    stderrPreview: result.stderrPreview,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
  };
}

export function validateToolExecutionState(value: unknown): ToolExecutionState {
  const state = value as Partial<ToolExecutionState>;

  if (!state || typeof state !== "object" || typeof state.sprintId !== "string" || !state.sprintId.trim()) {
    throw new Error("ToolExecutionState sprintId is required.");
  }

  return {
    sprintId: state.sprintId,
    commands: Array.isArray(state.commands) ? state.commands.map(validateCommandProposal) : [],
    toolCalls: Array.isArray(state.toolCalls) ? state.toolCalls.map((call) => validateMcpToolCall(call)) : [],
    results: Array.isArray(state.results) ? state.results.map(validateCommandExecutionResult) : [],
  };
}

export function classifyCommandRisk(command: string, args: string[] = [], scriptBody = ""): CommandRiskLevel {
  const joined = [command, ...args, scriptBody].join(" ");

  if (BLOCKED_COMMAND_PATTERNS.some((pattern) => pattern.test(joined))) {
    return "blocked";
  }

  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(joined))) {
    return "high";
  }

  if (command.includes("npm") && args[0] === "run") {
    return "low";
  }

  return "medium";
}

export function createPackageScriptProposals(scripts: PackageScriptMap, createdAt: string, platform = os.platform()): CommandProposal[] {
  return Object.entries(scripts)
    .filter(([name]) => VALIDATION_SCRIPT_HINTS.some((hint) => name.toLowerCase().includes(hint)))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, scriptBody]) => {
      const command = platform === "win32" ? "npm.cmd" : "npm";
      const args = ["run", name];
      return {
        id: `pkg-${name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`,
        label: `npm run ${name}`,
        command,
        args,
        source: "package-script",
        riskLevel: classifyCommandRisk(command, args, scriptBody),
        status: "proposed",
        createdAt,
      };
    });
}

export function mergeCommandProposals(existing: CommandProposal[], incoming: CommandProposal[]): CommandProposal[] {
  const byId = new Map(existing.map((proposal) => [proposal.id, proposal]));

  for (const proposal of incoming) {
    if (!byId.has(proposal.id)) {
      byId.set(proposal.id, proposal);
    }
  }

  return Array.from(byId.values()).map(validateCommandProposal);
}

export function approveCommandProposal(state: ToolExecutionState, proposalId: string, approvedAt: string): ToolExecutionState {
  let found = false;
  const commands = state.commands.map((proposal) => {
    if (proposal.id !== proposalId) return proposal;
    found = true;

    if (proposal.riskLevel === "blocked") {
      throw new Error("Blocked command cannot be approved.");
    }

    if (proposal.status === "executed" || proposal.status === "failed") {
      throw new Error("Executed command cannot be re-approved.");
    }

    return validateCommandProposal({
      ...proposal,
      status: "approved",
      approvedAt,
    });
  });

  if (!found) {
    throw new Error("Command proposal was not found.");
  }

  return validateToolExecutionState({ ...state, commands });
}

export function recordCommandExecutionResult(
  state: ToolExecutionState,
  result: CommandExecutionResult,
): ToolExecutionState {
  const proposal = state.commands.find((command) => command.id === result.proposalId);

  if (!proposal) {
    throw new Error("Execution result proposal was not found.");
  }

  if (proposal.status !== "approved") {
    throw new Error("Command must be approved before execution.");
  }

  const status: ToolExecutionStatus = result.exitCode === 0 ? "executed" : "failed";
  const commands = state.commands.map((command) => (command.id === result.proposalId ? { ...command, status } : command));
  const existingResults = state.results.filter((existing) => existing.proposalId !== result.proposalId);

  return validateToolExecutionState({
    ...state,
    commands,
    results: [...existingResults, validateCommandExecutionResult(result)],
  });
}

export function summarizeToolExecution(state: ToolExecutionState): ToolExecutionSummary {
  const counts: Record<ToolExecutionStatus, number> = {
    proposed: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    failed: 0,
  };

  for (const command of state.commands) {
    counts[command.status] += 1;
  }

  return {
    ...state,
    counts,
    failedCommands: state.commands.filter((command) => command.status === "failed"),
    approvalRequiredCount: state.commands.filter((command) => command.status === "proposed" && command.riskLevel !== "blocked").length,
  };
}

export async function readToolExecutionState(repoRoot: string): Promise<ToolExecutionState> {
  try {
    const content = await readFile(resolveToolStatePath(repoRoot), "utf8");
    return validateToolExecutionState(JSON.parse(content) as unknown);
  } catch {
    return defaultToolExecutionState();
  }
}

export async function writeToolExecutionState(repoRoot: string, state: ToolExecutionState): Promise<ToolExecutionState> {
  const validated = validateToolExecutionState(state);
  const statePath = resolveToolStatePath(repoRoot);

  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return validated;
}

export async function ensurePackageScriptProposals(repoRoot: string): Promise<ToolExecutionState> {
  const state = await readToolExecutionState(repoRoot);
  const scripts = await readPackageScripts(repoRoot);
  const proposals = createPackageScriptProposals(scripts, new Date().toISOString());
  const merged = validateToolExecutionState({
    ...state,
    commands: mergeCommandProposals(state.commands, proposals),
  });

  return writeToolExecutionState(repoRoot, merged);
}

export async function approveStoredCommandProposal(repoRoot: string, proposalId: string): Promise<ToolExecutionState> {
  const state = await readToolExecutionState(repoRoot);
  return writeToolExecutionState(repoRoot, approveCommandProposal(state, proposalId, new Date().toISOString()));
}

export async function executeStoredCommandProposal(repoRoot: string, proposalId: string): Promise<ToolExecutionState> {
  const state = await readToolExecutionState(repoRoot);
  const proposal = state.commands.find((command) => command.id === proposalId);

  if (!proposal) {
    throw new Error("Command proposal was not found.");
  }

  if (proposal.status !== "approved") {
    throw new Error("Command must be approved before execution.");
  }

  if (proposal.riskLevel === "blocked") {
    throw new Error("Blocked command cannot be executed.");
  }

  const result = await runCommand(repoRoot, proposal);
  return writeToolExecutionState(repoRoot, recordCommandExecutionResult(state, result));
}

async function readPackageScripts(repoRoot: string): Promise<PackageScriptMap> {
  try {
    const content = await readFile(path.resolve(repoRoot, "package.json"), "utf8");
    const parsed = JSON.parse(content) as { scripts?: PackageScriptMap };
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
}

function resolveToolStatePath(repoRoot: string): string {
  const workspaceRoot = path.resolve(repoRoot, WORKSPACE_DIR);
  const resolved = path.resolve(repoRoot, STATE_PATH);
  const relative = path.relative(workspaceRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Tool execution state path escapes .mcp-task/.");
  }

  return resolved;
}

function runCommand(repoRoot: string, proposal: CommandProposal): Promise<CommandExecutionResult> {
  const startedAt = new Date().toISOString();

  return new Promise((resolve) => {
    const child = spawn(proposal.command, proposal.args, {
      cwd: repoRoot,
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = boundedAppend(stdout, chunk.toString());
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = boundedAppend(stderr, chunk.toString());
    });

    child.on("error", (error) => {
      resolve({
        proposalId: proposal.id,
        exitCode: null,
        stdoutPreview: stdout,
        stderrPreview: boundedAppend(stderr, error.message),
        startedAt,
        completedAt: new Date().toISOString(),
      });
    });

    child.on("close", (exitCode) => {
      resolve({
        proposalId: proposal.id,
        exitCode,
        stdoutPreview: stdout,
        stderrPreview: stderr,
        startedAt,
        completedAt: new Date().toISOString(),
      });
    });
  });
}

function boundedAppend(current: string, next: string): string {
  return `${current}${next}`.slice(-OUTPUT_PREVIEW_LIMIT);
}
