import type { TemplateId } from "../../spec/templates/registry.js";

export interface IntentDefinition {
  intent: TemplateId;
  description: string;
  examples: string[];
  riskBias: number;
}

export const INTENT_CATALOG: IntentDefinition[] = [
  {
    intent: "security_analysis",
    description: "security secure vulnerability threat authentication authorization exploit remediation severity risk analysis",
    examples: ["analyze security flaws", "find auth vulnerabilities", "review code for injection risks", "design secure api gateway"],
    riskBias: 0.35,
  },
  {
    intent: "frontend_component",
    description: "frontend ui component visual style layout interaction accessibility button form color",
    examples: ["change button color", "modify button background", "create react component"],
    riskBias: 0,
  },
  {
    intent: "api_design",
    description: "api endpoint request response schema status codes resource operations gateway",
    examples: ["design rest api", "create api gateway contract", "define endpoint schema"],
    riskBias: 0.12,
  },
  {
    intent: "architecture_design",
    description: "system architecture distributed migration components data flow scalability reliability",
    examples: ["create architecture spec", "design multi-system migration", "plan scalable service architecture"],
    riskBias: 0.2,
  },
  {
    intent: "code_refactor",
    description: "code refactor modularize maintainability split god file cleanup rewrite",
    examples: ["refactor god service", "split module responsibilities", "cleanup orchestration file"],
    riskBias: 0.08,
  },
  {
    intent: "observability_analysis",
    description: "observability logs metrics tracing monitoring alerts telemetry provider latency",
    examples: ["add structured logs", "design tracing metrics", "monitor provider latency"],
    riskBias: 0.08,
  },
  {
    intent: "database_design",
    description: "database schema table index query migration relationship sql persistence",
    examples: ["design database schema", "add indexes", "plan data migration"],
    riskBias: 0.12,
  },
  {
    intent: "ai_orchestration",
    description: "ai llm model orchestration routing planner provider fallback semantic governance",
    examples: ["build ai router", "orchestrate gemini llama", "semantic deterministic ai execution"],
    riskBias: 0.18,
  },
  {
    intent: "testing_strategy",
    description: "tests regression golden fixtures assertions drift stability validation coverage",
    examples: ["create golden test suite", "add regression fixtures", "detect ai output drift"],
    riskBias: 0.05,
  },
  {
    intent: "performance_optimization",
    description: "performance latency throughput cache optimize bottleneck speed resource",
    examples: ["reduce latency", "optimize cache hit rate", "find performance bottlenecks"],
    riskBias: 0.08,
  },
];
