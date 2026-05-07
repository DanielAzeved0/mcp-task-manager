export interface ActionIntentDecision {
  domain: "code" | "frontend" | "api" | "database" | "security" | "architecture" | "observability" | "unknown";
  task: "analyze" | "refactor" | "create" | "test" | "secure" | "optimize" | "document" | "unknown";
  resolvedIntent?: string;
  boosts: Record<string, number>;
  penalties: Record<string, number>;
  reasons: string[];
}

function normalizePrompt(prompt: string): string {
  return prompt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ");
}

function hasAny(prompt: string, terms: string[]): boolean {
  return terms.some((term) => prompt.includes(normalizePrompt(term)));
}

export function routeIntentByAction(prompt: string): ActionIntentDecision {
  const normalized = normalizePrompt(prompt);
  const reasons: string[] = [];

  const domain =
    hasAny(normalized, ["vulnerabilidade", "seguranca", "security", "exploit", "xss", "csrf"]) ? "security" :
    hasAny(normalized, ["endpoint", "api", "rest", "graphql", "request", "response", "gateway"]) ? "api" :
    hasAny(normalized, ["botao", "button", "css", "layout", "ui", "frontend", "componente"]) ? "frontend" :
    hasAny(normalized, ["database", "banco", "tabela", "table", "index", "migration", "sql"]) ? "database" :
    hasAny(normalized, ["codigo", "code", "classe", "funcao", "arquivo", "projeto"]) ? "code" :
    hasAny(normalized, ["arquitetura", "architecture", "sistema", "distributed"]) ? "architecture" :
    hasAny(normalized, ["logs", "metricas", "tracing", "observability", "monitoramento"]) ? "observability" :
    "unknown";

  const task =
    hasAny(normalized, ["vulnerabilidade", "seguranca", "falha de seguranca", "exploit", "secure"]) ? "secure" :
    hasAny(normalized, ["refatorar", "refatore", "reestruturar", "rewrite", "refactor", "modularizar"]) ? "refactor" :
    hasAny(normalized, ["analisar", "analise", "avaliar", "verificar", "revisar", "review", "analyze"]) ? "analyze" :
    hasAny(normalized, ["testar", "teste", "tests", "coverage"]) ? "test" :
    hasAny(normalized, ["otimizar", "optimize", "performance"]) ? "optimize" :
    hasAny(normalized, ["documentar", "document"]) ? "document" :
    hasAny(normalized, ["criar", "create", "design", "desenhar"]) ? "create" :
    "unknown";

  const boosts: Record<string, number> = {};
  const penalties: Record<string, number> = {};
  let resolvedIntent: string | undefined;

  if (domain === "security" || task === "secure") {
    resolvedIntent = "security_analysis";
    boosts.security_analysis = 0.45;
    penalties.code_analysis = -0.12;
    reasons.push("secure_action_or_domain");
  } else if (domain === "code" && task === "analyze") {
    resolvedIntent = "code_analysis";
    boosts.code_analysis = 0.35;
    penalties.code_refactor = -0.25;
    reasons.push("analyze_code_action");
  } else if (domain === "code" && task === "refactor") {
    resolvedIntent = "code_refactor";
    boosts.code_refactor = 0.35;
    penalties.code_analysis = -0.12;
    reasons.push("refactor_code_action");
  } else if (domain === "api") {
    resolvedIntent = "api_design";
    boosts.api_design = 0.3;
    reasons.push("api_domain");
  } else if (domain === "frontend") {
    resolvedIntent = "frontend_component";
    boosts.frontend_component = 0.3;
    reasons.push("frontend_domain");
  }

  return { domain, task, resolvedIntent, boosts, penalties, reasons };
}
