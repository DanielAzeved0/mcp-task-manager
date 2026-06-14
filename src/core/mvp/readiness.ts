export type MvpReadinessCategory =
  | "workspace"
  | "pipeline"
  | "artifacts"
  | "ui"
  | "cli"
  | "validation"
  | "documentation"
  | "security"
  | "offline";

export type MvpReadinessCheck = {
  id: string;
  category: MvpReadinessCategory;
  label: string;
  status: "passed" | "warning" | "failed";
  evidence: string;
  required: boolean;
};

export type MvpRisk = {
  id: string;
  severity: "low" | "medium" | "high";
  description: string;
  mitigation: string;
};

export type MvpReadinessReport = {
  sprintId: "SPRINT-010";
  status: "ready" | "not_ready";
  score: number;
  generatedAt: string;
  checks: MvpReadinessCheck[];
  risks: MvpRisk[];
  nextActions: string[];
};

export class MvpReadinessError extends Error {
  constructor(
    public readonly code:
      | "readiness_check_failed"
      | "documentation_incomplete"
      | "validation_failed"
      | "unsafe_scope_expansion"
      | "mvp_not_ready",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const CATEGORIES = new Set<MvpReadinessCategory>([
  "workspace",
  "pipeline",
  "artifacts",
  "ui",
  "cli",
  "validation",
  "documentation",
  "security",
  "offline",
]);

export function validateReadinessCheck(value: unknown): MvpReadinessCheck {
  const check = value as Partial<MvpReadinessCheck>;

  if (!check || typeof check !== "object" || typeof check.id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/i.test(check.id)) {
    throw new MvpReadinessError("readiness_check_failed", "Readiness check id is invalid.");
  }

  if (!CATEGORIES.has(check.category as MvpReadinessCategory)) {
    throw new MvpReadinessError("readiness_check_failed", "Readiness check category is invalid.", { id: check.id });
  }

  if (typeof check.label !== "string" || !check.label.trim()) {
    throw new MvpReadinessError("readiness_check_failed", "Readiness check label is required.", { id: check.id });
  }

  if (check.status !== "passed" && check.status !== "warning" && check.status !== "failed") {
    throw new MvpReadinessError("readiness_check_failed", "Readiness check status is invalid.", { id: check.id });
  }

  if (typeof check.evidence !== "string" || !check.evidence.trim()) {
    throw new MvpReadinessError("readiness_check_failed", "Readiness check evidence is required.", { id: check.id });
  }

  if (typeof check.required !== "boolean") {
    throw new MvpReadinessError("readiness_check_failed", "Readiness check required flag is required.", { id: check.id });
  }

  return {
    id: check.id,
    category: check.category as MvpReadinessCategory,
    label: check.label,
    status: check.status,
    evidence: check.evidence,
    required: check.required,
  };
}

export function validateMvpRisk(value: unknown): MvpRisk {
  const risk = value as Partial<MvpRisk>;

  if (!risk || typeof risk !== "object" || typeof risk.id !== "string" || !risk.id.trim()) {
    throw new MvpReadinessError("validation_failed", "Risk id is required.");
  }

  if (risk.severity !== "low" && risk.severity !== "medium" && risk.severity !== "high") {
    throw new MvpReadinessError("validation_failed", "Risk severity is invalid.", { id: risk.id });
  }

  if (typeof risk.description !== "string" || !risk.description.trim()) {
    throw new MvpReadinessError("validation_failed", "Risk description is required.", { id: risk.id });
  }

  if (typeof risk.mitigation !== "string" || !risk.mitigation.trim()) {
    throw new MvpReadinessError("validation_failed", "Risk mitigation is required.", { id: risk.id });
  }

  return {
    id: risk.id,
    severity: risk.severity,
    description: risk.description,
    mitigation: risk.mitigation,
  };
}

export function calculateReadinessScore(checks: MvpReadinessCheck[]): number {
  if (!checks.length) return 0;

  const total = checks.reduce((score, check) => {
    if (check.status === "passed") return score + 100;
    if (check.status === "warning") return score + 75;
    return score;
  }, 0);

  return Math.round(total / checks.length);
}

export function deriveReadinessStatus(score: number, checks: MvpReadinessCheck[]): "ready" | "not_ready" {
  const hasRequiredFailure = checks.some((check) => check.required && check.status === "failed");
  return score >= 90 && !hasRequiredFailure ? "ready" : "not_ready";
}

export function validateMvpReadinessReport(value: unknown): MvpReadinessReport {
  const report = value as Partial<MvpReadinessReport>;

  if (!report || typeof report !== "object" || report.sprintId !== "SPRINT-010") {
    throw new MvpReadinessError("validation_failed", "Readiness report must belong to SPRINT-010.");
  }

  if (report.status !== "ready" && report.status !== "not_ready") {
    throw new MvpReadinessError("validation_failed", "Readiness report status is invalid.");
  }

  if (typeof report.score !== "number" || report.score < 0 || report.score > 100) {
    throw new MvpReadinessError("validation_failed", "Readiness report score must be between 0 and 100.");
  }

  if (typeof report.generatedAt !== "string" || Number.isNaN(Date.parse(report.generatedAt))) {
    throw new MvpReadinessError("validation_failed", "Readiness report generatedAt must be an ISO date string.");
  }

  if (!Array.isArray(report.checks) || !report.checks.length) {
    throw new MvpReadinessError("readiness_check_failed", "Readiness report checks are required.");
  }

  const checks = report.checks.map(validateReadinessCheck);
  const risks = Array.isArray(report.risks) ? report.risks.map(validateMvpRisk) : [];
  const nextActions = Array.isArray(report.nextActions) && report.nextActions.every((item) => typeof item === "string") ? report.nextActions : [];
  const derivedStatus = deriveReadinessStatus(report.score, checks);

  if (report.status === "ready" && derivedStatus !== "ready") {
    throw new MvpReadinessError("mvp_not_ready", "MVP cannot be ready below score 90 or with failed required checks.", {
      score: report.score,
      failedRequiredChecks: checks.filter((check) => check.required && check.status === "failed").map((check) => check.id),
    });
  }

  return {
    sprintId: "SPRINT-010",
    status: report.status,
    score: report.score,
    generatedAt: report.generatedAt,
    checks,
    risks,
    nextActions,
  };
}

export function assertRequiredReadmeSections(content: string): string[] {
  const requiredSections = ["MCP Harness Task Manager", "CLI Local", "MVP Local", "Limitações do MVP", "Validação Local"];
  return requiredSections.filter((section) => !content.includes(section));
}
