import type { PromptSpec } from "../../schemas/promptSpec.js";

export type TemplateId =
  | "security_analysis"
  | "frontend_component"
  | "api_design"
  | "architecture_design"
  | "code_refactor"
  | "observability_analysis"
  | "database_design"
  | "ai_orchestration"
  | "testing_strategy"
  | "performance_optimization"
  | "general_spec";

export interface SpecTemplate {
  id: TemplateId;
  version: string;
  intents: string[];
  inputs: string[];
  outputs: string[];
  contract: PromptSpec;
}

function field(type: string, description: string, extra: Record<string, unknown> = {}) {
  return { type, description, ...extra };
}

export const TEMPLATE_REGISTRY: Record<TemplateId, SpecTemplate> = {
  security_analysis: {
    id: "security_analysis",
    version: "1.0.0",
    intents: ["security_analysis"],
    inputs: ["code", "language", "threat_model"],
    outputs: ["vulnerabilities", "severity", "remediation", "risk_summary"],
    contract: {
      task_instruction: "Analyze security flaws and return actionable remediation details.",
      input_fields: {
        code: field("string", "Code or configuration to analyze"),
        language: field("string", "Language, framework, or platform context"),
      },
      output_fields: {
        vulnerabilities: field("array", "Detected vulnerabilities", { items: { type: "object" } }),
        severity: field("string", "Overall severity classification"),
        remediation: field("array", "Concrete remediation steps", { items: { type: "string" } }),
        risk_summary: field("object", "Risk summary and affected areas"),
      },
    },
  },
  frontend_component: {
    id: "frontend_component",
    version: "1.0.0",
    intents: ["frontend_component"],
    inputs: ["component_name", "requirements", "state"],
    outputs: ["ui_structure", "styles", "behavior", "accessibility"],
    contract: {
      task_instruction: "Define a frontend component with structure, styling, behavior, and accessibility details.",
      input_fields: {
        component_name: field("string", "Name or role of the component"),
        requirements: field("string", "Functional and visual requirements"),
      },
      output_fields: {
        ui_structure: field("object", "Component layout and child structure"),
        styles: field("object", "Visual design tokens and style rules"),
        behavior: field("object", "Interaction and state behavior"),
        accessibility: field("object", "Accessibility requirements and checks"),
      },
    },
  },
  api_design: {
    id: "api_design",
    version: "1.0.0",
    intents: ["api_design"],
    inputs: ["resource", "operations", "constraints"],
    outputs: ["endpoints", "request_schema", "response_schema", "status_codes"],
    contract: {
      task_instruction: "Design API endpoints with deterministic request and response contracts.",
      input_fields: {
        resource: field("string", "Resource or domain object"),
        operations: field("array", "Operations to support"),
      },
      output_fields: {
        endpoints: field("array", "Endpoint definitions", { items: { type: "object" } }),
        request_schema: field("object", "Canonical request schema"),
        response_schema: field("object", "Canonical response schema"),
        status_codes: field("array", "Supported status codes", { items: { type: "string" } }),
      },
    },
  },
  architecture_design: {
    id: "architecture_design",
    version: "1.0.0",
    intents: ["architecture_design"],
    inputs: ["objective", "constraints", "systems"],
    outputs: ["components", "data_flow", "risks", "migration_plan"],
    contract: {
      task_instruction: "Produce a system architecture plan with components, flows, risks, and migration steps.",
      input_fields: {
        objective: field("string", "Architecture objective"),
        constraints: field("array", "Known constraints and requirements"),
      },
      output_fields: {
        components: field("array", "System components and responsibilities", { items: { type: "object" } }),
        data_flow: field("object", "Primary data and control flow"),
        risks: field("array", "Architecture risks and mitigations", { items: { type: "object" } }),
        migration_plan: field("array", "Incremental implementation plan", { items: { type: "object" } }),
      },
    },
  },
  code_refactor: {
    id: "code_refactor",
    version: "1.0.0",
    intents: ["code_refactor"],
    inputs: ["code_area", "goals", "constraints"],
    outputs: ["refactor_plan", "module_boundaries", "compatibility_notes", "tests"],
    contract: {
      task_instruction: "Create a refactor plan with module boundaries, compatibility notes, and tests.",
      input_fields: {
        code_area: field("string", "Code area to refactor"),
        goals: field("array", "Refactor goals"),
      },
      output_fields: {
        refactor_plan: field("array", "Ordered refactor steps", { items: { type: "object" } }),
        module_boundaries: field("object", "Proposed module ownership"),
        compatibility_notes: field("array", "Behavior compatibility notes", { items: { type: "string" } }),
        tests: field("array", "Required tests", { items: { type: "string" } }),
      },
    },
  },
  observability_analysis: {
    id: "observability_analysis",
    version: "1.0.0",
    intents: ["observability_analysis"],
    inputs: ["system", "events", "metrics"],
    outputs: ["logs", "metrics", "traces", "alerts"],
    contract: {
      task_instruction: "Define observability events, metrics, traces, and alerting strategy.",
      input_fields: {
        system: field("string", "System or workflow being observed"),
        events: field("array", "Important lifecycle events"),
      },
      output_fields: {
        logs: field("array", "Structured log events", { items: { type: "object" } }),
        metrics: field("array", "Metric definitions", { items: { type: "object" } }),
        traces: field("array", "Trace spans and correlation points", { items: { type: "object" } }),
        alerts: field("array", "Alert rules and thresholds", { items: { type: "object" } }),
      },
    },
  },
  database_design: {
    id: "database_design",
    version: "1.0.0",
    intents: ["database_design"],
    inputs: ["entities", "queries", "scale"],
    outputs: ["tables", "indexes", "relationships", "migration_strategy"],
    contract: {
      task_instruction: "Design database structures, indexes, relationships, and migration strategy.",
      input_fields: {
        entities: field("array", "Domain entities"),
        queries: field("array", "Expected query patterns"),
      },
      output_fields: {
        tables: field("array", "Table or collection definitions", { items: { type: "object" } }),
        indexes: field("array", "Index definitions", { items: { type: "object" } }),
        relationships: field("array", "Relationship definitions", { items: { type: "object" } }),
        migration_strategy: field("object", "Migration and rollout strategy"),
      },
    },
  },
  ai_orchestration: {
    id: "ai_orchestration",
    version: "1.0.0",
    intents: ["ai_orchestration"],
    inputs: ["prompt", "providers", "policies"],
    outputs: ["routing_policy", "fallbacks", "quality_gates", "observability"],
    contract: {
      task_instruction: "Define AI orchestration with routing, fallbacks, quality gates, and observability.",
      input_fields: {
        prompt: field("string", "User request or AI workflow"),
        providers: field("array", "Available AI providers"),
      },
      output_fields: {
        routing_policy: field("object", "Backend selection policy"),
        fallbacks: field("array", "Fallback rules", { items: { type: "object" } }),
        quality_gates: field("array", "Quality and validation gates", { items: { type: "object" } }),
        observability: field("object", "AI workflow observability contract"),
      },
    },
  },
  testing_strategy: {
    id: "testing_strategy",
    version: "1.0.0",
    intents: ["testing_strategy"],
    inputs: ["feature", "risks", "contracts"],
    outputs: ["test_cases", "fixtures", "assertions", "drift_detection"],
    contract: {
      task_instruction: "Define deterministic tests, fixtures, assertions, and drift detection.",
      input_fields: {
        feature: field("string", "Feature or workflow under test"),
        risks: field("array", "Risk areas"),
      },
      output_fields: {
        test_cases: field("array", "Executable test cases", { items: { type: "object" } }),
        fixtures: field("array", "Reusable fixtures", { items: { type: "object" } }),
        assertions: field("array", "Expected assertions", { items: { type: "string" } }),
        drift_detection: field("object", "Regression and drift detection policy"),
      },
    },
  },
  performance_optimization: {
    id: "performance_optimization",
    version: "1.0.0",
    intents: ["performance_optimization"],
    inputs: ["workflow", "bottlenecks", "targets"],
    outputs: ["bottleneck_analysis", "optimizations", "metrics", "rollout_plan"],
    contract: {
      task_instruction: "Analyze performance and return optimizations, metrics, and rollout plan.",
      input_fields: {
        workflow: field("string", "Workflow or system to optimize"),
        targets: field("object", "Latency, throughput, or resource targets"),
      },
      output_fields: {
        bottleneck_analysis: field("object", "Likely bottlenecks and causes"),
        optimizations: field("array", "Optimization actions", { items: { type: "object" } }),
        metrics: field("array", "Metrics to track", { items: { type: "object" } }),
        rollout_plan: field("array", "Safe rollout steps", { items: { type: "object" } }),
      },
    },
  },
  general_spec: {
    id: "general_spec",
    version: "1.0.0",
    intents: ["general_spec"],
    inputs: ["user_request", "context"],
    outputs: ["structured_result", "summary", "validation"],
    contract: {
      task_instruction: "Handle the user request with deterministic structured inputs and outputs.",
      input_fields: {
        user_request: field("string", "The user's request"),
      },
      output_fields: {
        structured_result: field("object", "Structured result"),
        summary: field("string", "Concise result summary"),
        validation: field("object", "Validation status and issues"),
      },
    },
  },
};

export function selectTemplate(intent: string): SpecTemplate {
  const match = Object.values(TEMPLATE_REGISTRY).find((template) => template.intents.includes(intent));
  return match ?? TEMPLATE_REGISTRY.general_spec;
}
