export interface IntentPriorityAdjustment {
  boosts: Record<string, number>;
  penalties: Record<string, number>;
  reasons: string[];
  priority_intent?: string;
  domain_weight?: number;
  verb_weight?: number;
  context_weight?: number;
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

const REFACTOR_VERBS = [
  "refatorar",
  "refatore",
  "refatora",
  "refactor",
  "reestruturar",
  "reorganizar",
  "modularizar",
  "limpar",
  "cleanup",
  "rewrite",
  "reescrever",
  "separar responsabilidades",
  "dividir responsabilidades",
  "extrair modulo",
  "extrair funcao",
  "remover duplicacao",
  "desacoplar",
  "melhorar estrutura",
];

const CODE_CONTEXT_TERMS = [
  "codigo",
  "code",
  "classe",
  "funcao",
  "arquivo",
  "modulo",
  "service",
  "component",
  "projeto",
  "legado",
  "god file",
  "god service",
];

const NON_REFACTOR_TASK_TERMS = [
  "criar api",
  "create api",
  "endpoint",
  "request",
  "response",
  "database",
  "table",
  "botao",
  "button",
  "css",
  "vulnerabilidade",
  "security",
  "teste",
  "test",
];

export function applyIntentPrioritizationMatrix(prompt: string): IntentPriorityAdjustment {
  const normalized = normalizePrompt(prompt);
  const hasRefactorVerb = hasAny(normalized, REFACTOR_VERBS);
  const hasCodeContext = hasAny(normalized, CODE_CONTEXT_TERMS);
  const hasConflictingTask = hasAny(normalized, NON_REFACTOR_TASK_TERMS);
  const boosts: Record<string, number> = {};
  const penalties: Record<string, number> = {};
  const reasons: string[] = [];

  if (hasRefactorVerb && hasCodeContext) {
    boosts.code_refactor = 0.42;
    penalties.api_design = -0.32;
    penalties.database_design = -0.22;
    penalties.frontend_component = -0.18;
    penalties.code_analysis = -0.14;
    penalties.general_spec = -0.18;
    reasons.push("code_refactor_priority:verb_and_code_context");
  }

  if (hasRefactorVerb && !hasCodeContext) {
    boosts.code_refactor = Math.max(boosts.code_refactor ?? 0, 0.22);
    penalties.api_design = Math.min(penalties.api_design ?? 0, -0.16);
    reasons.push("code_refactor_priority:refactor_verb");
  }

  if (hasRefactorVerb && hasConflictingTask) {
    penalties.api_design = Math.min(penalties.api_design ?? 0, -0.36);
    reasons.push("code_refactor_priority:conflicting_intent_penalty");
  }

  return {
    boosts,
    penalties,
    reasons,
    priority_intent: hasRefactorVerb ? "code_refactor" : undefined,
    domain_weight: hasCodeContext ? 0.25 : 0,
    verb_weight: hasRefactorVerb ? 0.45 : 0,
    context_weight: hasRefactorVerb && hasCodeContext ? 0.3 : 0,
  };
}
