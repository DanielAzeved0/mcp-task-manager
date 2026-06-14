import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { buildWorkspaceSummary, WorkspaceArtifactError } from "../infra/file-system/workspaceArtifacts.js";

export type CliCommandName = "start" | "status" | "doctor" | "help" | "version";

export type CliCommand = {
  name: CliCommandName;
  args: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
};

export type CliStatusSummary = {
  productName: string;
  shortName: string;
  currentSprint: string | null;
  sprintStatus: string | null;
  contractReady: boolean;
  qaStatus: "passed" | "failed" | "pending" | "missing";
  evaluationScore: number | null;
  doneBlocked: boolean;
  memoryDocuments: number;
  toolCommands: number;
};

export type DoctorCheck = {
  id: string;
  label: string;
  status: "passed" | "warning" | "failed";
  message: string;
};

export type PackageMetadata = {
  name: string;
  version: string;
  type: "module";
  bin?: Record<string, string>;
  scripts: Record<string, string>;
};

export type CliErrorCode =
  | "unknown_command"
  | "workspace_not_found"
  | "package_metadata_invalid"
  | "doctor_failed"
  | "start_failed"
  | "status_failed";

export class CliError extends Error {
  constructor(
    public readonly code: CliErrorCode,
    message: string,
    public readonly exitCode: 0 | 1 | 2,
  ) {
    super(message);
  }
}

export type CliRunResult = {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
};

const ESSENTIAL_SCRIPTS = ["dev", "build", "test:golden", "start"];

export function parseCliCommand(argv: string[], cwd = process.cwd(), env: Record<string, string | undefined> = process.env): CliCommand {
  const args = argv.filter((arg) => arg !== "node" && !arg.endsWith("mcp-task.js"));
  const [rawName, ...rest] = args;

  if (!rawName || rawName === "--help" || rawName === "-h") {
    return { name: "help", args: rest, cwd, env };
  }

  if (rawName === "--version" || rawName === "-v") {
    return { name: "version", args: rest, cwd, env };
  }

  if (rawName === "start" || rawName === "status" || rawName === "doctor" || rawName === "help" || rawName === "version") {
    return { name: rawName, args: rest, cwd, env };
  }

  throw new CliError("unknown_command", `Unknown command: ${rawName}`, 2);
}

export async function runCliCommand(command: CliCommand): Promise<CliRunResult> {
  try {
    if (command.name === "help") {
      return { exitCode: 0, stdout: formatHelp(), stderr: "" };
    }

    if (command.name === "version") {
      const metadata = await readPackageMetadata(command.cwd);
      return { exitCode: 0, stdout: `${metadata.version}\n`, stderr: "" };
    }

    if (command.name === "status") {
      return { exitCode: 0, stdout: formatCliStatus(await readCliStatus(command.cwd)), stderr: "" };
    }

    if (command.name === "doctor") {
      const checks = await runDoctorChecks(command.cwd);
      const hasFailed = checks.some((check) => check.status === "failed");
      return {
        exitCode: hasFailed ? 1 : 0,
        stdout: formatDoctorChecks(checks),
        stderr: "",
      };
    }

    if (command.name === "start") {
      return {
        exitCode: 0,
        stdout: "mcp-task start\n\nStarting local MCP Harness server...\n",
        stderr: "",
      };
    }

    throw new CliError("unknown_command", `Unknown command: ${command.name}`, 2);
  } catch (error) {
    if (error instanceof CliError) {
      return { exitCode: error.exitCode, stdout: "", stderr: formatCliError(error) };
    }

    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, stdout: "", stderr: formatCliError(new CliError("status_failed", message, 1)) };
  }
}

export async function readCliStatus(cwd: string): Promise<CliStatusSummary> {
  try {
    const workspace = await buildWorkspaceSummary(cwd);
    const currentSprint = workspace.currentSprint;
    const sprintStatus = workspace.sprints.find((sprint) => sprint.id === currentSprint)?.status ?? null;

    return {
      productName: workspace.productName,
      shortName: workspace.shortName,
      currentSprint,
      sprintStatus,
      contractReady: !workspace.contractGate.buildBlocked,
      qaStatus: workspace.evaluationGate.qaStatus,
      evaluationScore: workspace.evaluationGate.score,
      doneBlocked: workspace.evaluationGate.doneBlocked,
      memoryDocuments: workspace.localMemory.documentCount,
      toolCommands: workspace.toolExecution.commands.length,
    };
  } catch (error) {
    if (error instanceof WorkspaceArtifactError && error.code === "workspace_not_found") {
      throw new CliError("workspace_not_found", ".mcp-task workspace was not found.", 1);
    }
    throw new CliError("status_failed", error instanceof Error ? error.message : "Failed to read workspace status.", 1);
  }
}

export function formatCliStatus(status: CliStatusSummary): string {
  return [
    "mcp-task status",
    "",
    `Product: ${status.productName}`,
    `Current sprint: ${status.currentSprint ?? "n/a"}`,
    `Sprint status: ${status.sprintStatus ?? "n/a"}`,
    `Contract: ${status.contractReady ? "ready" : "blocked"}`,
    `QA: ${status.qaStatus}`,
    `Evaluation score: ${status.evaluationScore ?? "n/a"}`,
    `Done gate: ${status.doneBlocked ? "blocked" : "open"}`,
    `Memory documents: ${status.memoryDocuments}`,
    `Tool commands: ${status.toolCommands}`,
    "",
  ].join("\n");
}

export async function runDoctorChecks(cwd: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [
    {
      id: "node-runtime",
      label: "node runtime available",
      status: "passed",
      message: `Node ${process.version}`,
    },
  ];

  const packageMetadata = await readPackageMetadataSafe(cwd);
  checks.push(packageMetadata.check);

  if (packageMetadata.metadata) {
    checks.push(validatePackageMetadata(packageMetadata.metadata));
    checks.push(...validateEssentialScripts(packageMetadata.metadata.scripts));
  }

  checks.push(await pathExistsCheck(cwd, ".mcp-task", ".mcp-task workspace found", true));
  checks.push(await pathExistsCheck(cwd, ".mcp-task/sprints/roadmap.md", "roadmap artifact found", true));
  checks.push(await pathExistsCheck(cwd, "README.md", "README usage documentation found", false));

  return checks;
}

export function formatDoctorChecks(checks: DoctorCheck[]): string {
  return [
    "mcp-task doctor",
    "",
    ...checks.map((check) => `[${check.status}] ${check.label} - ${check.message}`),
    "",
  ].join("\n");
}

export function validatePackageMetadata(metadata: PackageMetadata): DoctorCheck {
  const hasBin = metadata.bin?.["mcp-task"] === "dist/cli/mcp-task.js";
  const valid = metadata.name === "mcp-task" && metadata.type === "module" && hasBin;

  return {
    id: "package-metadata",
    label: "package metadata valid",
    status: valid ? "passed" : "failed",
    message: valid ? "name, module type and bin.mcp-task are aligned" : "package metadata must expose mcp-task as a local bin",
  };
}

export function validateEssentialScripts(scripts: Record<string, string>): DoctorCheck[] {
  return ESSENTIAL_SCRIPTS.map((scriptName) => ({
    id: `script-${scriptName}`,
    label: `script ${scriptName} found`,
    status: scripts[scriptName] ? "passed" : "failed",
    message: scripts[scriptName] ? scripts[scriptName] : "missing required script",
  }));
}

export function formatHelp(): string {
  return [
    "mcp-task",
    "",
    "Usage:",
    "  mcp-task start    Start the local MCP Harness server",
    "  mcp-task status   Show local workspace gates and sprint status",
    "  mcp-task doctor   Validate local package and workspace prerequisites",
    "  mcp-task --help   Show this help",
    "  mcp-task --version Show package version",
    "",
  ].join("\n");
}

export function formatCliError(error: CliError): string {
  return [`mcp-task error`, "", `${error.code}: ${error.message}`, ""].join("\n");
}

async function readPackageMetadata(cwd: string): Promise<PackageMetadata> {
  const content = await readFile(path.resolve(cwd, "package.json"), "utf8");
  const parsed = JSON.parse(content) as Partial<PackageMetadata>;

  if (typeof parsed.name !== "string" || typeof parsed.version !== "string" || parsed.type !== "module" || !parsed.scripts) {
    throw new CliError("package_metadata_invalid", "package.json metadata is invalid.", 1);
  }

  return {
    name: parsed.name,
    version: parsed.version,
    type: parsed.type,
    bin: parsed.bin,
    scripts: parsed.scripts,
  };
}

async function readPackageMetadataSafe(cwd: string): Promise<{ check: DoctorCheck; metadata: PackageMetadata | null }> {
  try {
    const metadata = await readPackageMetadata(cwd);
    return {
      metadata,
      check: {
        id: "package-json",
        label: "package.json found",
        status: "passed",
        message: `${metadata.name}@${metadata.version}`,
      },
    };
  } catch (error) {
    return {
      metadata: null,
      check: {
        id: "package-json",
        label: "package.json found",
        status: "failed",
        message: error instanceof Error ? error.message : "package.json could not be read",
      },
    };
  }
}

async function pathExistsCheck(cwd: string, relativePath: string, label: string, required: boolean): Promise<DoctorCheck> {
  try {
    await access(path.resolve(cwd, relativePath));
    return {
      id: `path-${relativePath.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      label,
      status: "passed",
      message: relativePath,
    };
  } catch {
    return {
      id: `path-${relativePath.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      label,
      status: required ? "failed" : "warning",
      message: `${relativePath} not found`,
    };
  }
}
