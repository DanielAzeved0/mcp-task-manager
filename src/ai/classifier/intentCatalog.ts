import type { TemplateId } from "../../spec/templates/registry.js";

export interface IntentDefinition {
  intent: TemplateId;
  description: string;
  examples: string[];
  riskBias: number;
  negativeTerms?: string[];
  boostKeywords?: string[];
  boostMultiplier?: number;
}

export const INTENT_CATALOG: IntentDefinition[] = [
  {
    intent: "security_analysis",
    description: "security secure vulnerability threat authentication authorization exploit remediation severity risk analysis",
    examples: ["analyze security flaws", "find auth vulnerabilities", "review code for injection risks", "design secure api gateway"],
    riskBias: 0.35,
    negativeTerms: ["button", "color", "css", "ui", "frontend", "style", "layout", "botao", "cor"],
    boostKeywords: ["vulnerability", "vulnerabilities", "vulnerabilidade", "vulnerabilidades", "security", "seguranca", "secure", "secure api", "api gateway", "auth", "exploit", "xss", "csrf"],
    boostMultiplier: 2.3,
  },
  {
    intent: "frontend_component",
    description: "frontend ui component visual style layout interaction accessibility button form color css botao cor alterar",
    examples: ["change button color", "modify button background", "create react component", "spec para alterar cor de botao", "change css button style"],
    riskBias: 0,
    negativeTerms: ["database", "sql", "schema migration", "endpoint", "api gateway", "status code"],
    boostKeywords: ["button", "botao", "css", "ui", "layout", "color", "cor", "style", "component", "frontend"],
    boostMultiplier: 1.8,
  },
  {
    intent: "api_design",
    description: "api endpoint request response schema status codes resource operations gateway",
    examples: ["design rest api", "create api gateway contract", "define endpoint schema"],
    riskBias: 0.12,
    negativeTerms: ["button", "botao", "color", "cor", "css", "ui", "frontend", "style", "layout", "component", "codigo", "code review", "pontos fortes", "pontos fracos", "boas praticas", "legibilidade", "manutenibilidade"],
    boostKeywords: ["api", "endpoint", "request", "response", "gateway", "rest", "status code"],
    boostMultiplier: 1.45,
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
    intent: "code_analysis",
    description: "code analysis review strengths weaknesses maintainability readability best practices quality clean code pontos fortes pontos fracos analisar codigo qualidade boas praticas legibilidade manutencao",
    examples: [
      "analisar pontos fortes de um codigo",
      "avaliar qualidade de codigo",
      "fazer code review",
      "ver boas praticas em um codigo",
      "analisar pontos fracos e fortes do projeto",
      "analyze code strengths",
      "review code quality",
    ],
    riskBias: 0.18,
    negativeTerms: [
      "endpoint",
      "request",
      "response",
      "status code",
      "database",
      "table",
      "index",
      "migration",
      "button",
      "css",
      "layout",
      "ui",
      "vulnerability",
      "vulnerabilities",
      "vulnerabilidade",
      "vulnerabilidades",
      "security",
      "seguranca",
      "exploit",
      "xss",
      "csrf",
    ],
    boostKeywords: [
      "analisar codigo",
      "analise codigo",
      "analise code",
      "codigo",
      "code review",
      "pontos fortes",
      "pontos fracos",
      "qualidade do codigo",
      "boas praticas",
      "legibilidade",
      "manutenibilidade",
      "maintainability",
      "clean code",
      "code quality",
      "strengths",
      "weaknesses",
    ],
    boostMultiplier: 2.1,
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
    negativeTerms: ["button", "botao", "color", "cor", "css", "ui", "frontend", "style", "layout", "component", "codigo", "code review", "pontos fortes", "pontos fracos", "boas praticas", "legibilidade", "manutenibilidade"],
    boostKeywords: ["database", "sql", "table", "index", "query", "migration"],
    boostMultiplier: 1.55,
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
