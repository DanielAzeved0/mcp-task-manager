import { logEvent, type TraceContext } from "../observability/logger.js";

export interface CandidateInputField {
  fieldName: string;
  fieldType: string;
  description: string;
  sourceKeyword: string;
  reason: string;
  confidence: number;
}

export interface RejectedInputField {
  fieldName: string;
  sourceKeyword: string;
  reason: string;
  confidence: number;
}

export interface AcceptedInputField {
  fieldName: string;
  sourceKeyword: string;
  reason: string;
  confidence: number;
}

export interface FieldInferenceGuardInput {
  sourceRequest: string;
  semanticIntent: string;
  domain: string;
  task: string;
  templateInputFields: Record<string, unknown>;
  candidateFields: CandidateInputField[];
  trace?: TraceContext;
}

export interface FieldInferenceGuardResult {
  acceptedFields: Record<string, { type: string; description: string }>;
  rejectedFields: RejectedInputField[];
  inferenceAudit: {
    accepted: AcceptedInputField[];
    rejected: RejectedInputField[];
    blocked_keywords: string[];
    total_candidates: number;
  };
}

const MINIMUM_CONFIDENCE = 0.72;
const MAX_INFERRED_FIELDS = 3;

const STOPWORDS = new Set([
  "esse", "essa", "isso", "isto", "aquele", "aquela", "para", "pra", "que", "quero", "vc", "voce", "você",
  "me", "de", "do", "da", "dos", "das", "um", "uma", "o", "a", "os", "as", "com", "sem", "em", "no", "na", "nos", "nas",
]);

const WEAK_KEYWORDS = new Set(["esse", "para", "quero", "melhorar", "fazer", "criar", "gerar", "arrumar", "ajustar"]);

const STRONG_SIGNALS_BY_DOMAIN: Record<string, string[]> = {
  code: ["codigo", "código", "funcao", "função", "classe", "componente", "controller", "service", "repository", "endpoint", "arquivo", "modulo", "módulo", "typescript", "javascript", "react", "node", "api"],
  database: ["tabela", "schema", "migration", "query", "indice", "índice", "relacionamento", "banco", "sql"],
  frontend: ["tela", "componente", "estado", "props", "layout", "formulario", "formulário", "react", "css"],
};

const ALLOWED_FIELDS_BY_INTENT: Record<string, { allowed: string[]; blockedUnlessExplicit: string[] }> = {
  code_refactor: {
    allowed: ["code_area", "goals", "code", "language", "constraints", "target_style"],
    blockedUnlessExplicit: ["component_name", "requirements", "analysis_scope"],
  },
  code_analysis: {
    allowed: ["code", "language", "analysis_scope"],
    blockedUnlessExplicit: ["component_name", "requirements"],
  },
  api_design: {
    allowed: ["resource_name", "endpoints", "methods", "auth_requirements", "data_contract"],
    blockedUnlessExplicit: ["code", "language", "component_name"],
  },
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .trim();
}

function hasStrongDomainSignal(domain: string, sourceKeyword: string): boolean {
  const normalized = normalize(sourceKeyword);
  return (STRONG_SIGNALS_BY_DOMAIN[domain] ?? []).some((term) => normalized.includes(normalize(term)));
}

function explicitReason(candidate: CandidateInputField): string | null {
  const keyword = normalize(candidate.sourceKeyword);
  if (candidate.fieldName === "language" && ["typescript", "javascript", "react", "node"].some((term) => keyword.includes(term))) {
    return "explicit_language_signal";
  }
  if (candidate.fieldName === "analysis_scope" && ["performance", "seguranca", "security", "legibilidade", "readability", "qualidade"].some((term) => keyword.includes(term))) {
    return "explicit_analysis_scope_signal";
  }
  return null;
}

function reject(candidate: CandidateInputField, reason: string): RejectedInputField {
  return {
    fieldName: candidate.fieldName,
    sourceKeyword: candidate.sourceKeyword,
    reason,
    confidence: candidate.confidence,
  };
}

export function guardInputFieldInference(input: FieldInferenceGuardInput): FieldInferenceGuardResult {
  logEvent("info", "input_field_inference_started", {
    semantic_intent: input.semanticIntent,
    domain: input.domain,
    task: input.task,
  }, input.trace);

  const acceptedFields: Record<string, { type: string; description: string }> = {};
  const accepted: AcceptedInputField[] = [];
  const rejectedFields: RejectedInputField[] = [];
  const blockedKeywords = new Set<string>();
  const policy = ALLOWED_FIELDS_BY_INTENT[input.semanticIntent];

  for (const candidate of input.candidateFields) {
    logEvent("debug", "input_field_candidate_detected", {
      field_name: candidate.fieldName,
      source_keyword: candidate.sourceKeyword,
      confidence: candidate.confidence,
    }, input.trace);

    const keyword = normalize(candidate.sourceKeyword);
    const explicit = explicitReason(candidate);
    const strongSignal = hasStrongDomainSignal(input.domain, candidate.sourceKeyword);
    let rejectionReason = "";

    if (STOPWORDS.has(keyword) || WEAK_KEYWORDS.has(keyword)) {
      rejectionReason = `weak_keyword_stopword:${candidate.sourceKeyword}`;
    } else if (candidate.confidence < MINIMUM_CONFIDENCE) {
      rejectionReason = "below_minimum_confidence";
    } else if (policy && !policy.allowed.includes(candidate.fieldName)) {
      rejectionReason = "field_not_allowed_for_intent";
    } else if (input.templateInputFields[candidate.fieldName]) {
      rejectionReason = "duplicate_template_field";
    } else if (policy?.blockedUnlessExplicit.includes(candidate.fieldName) && !explicit) {
      rejectionReason = "requires_explicit_mention";
    } else if (!strongSignal && !explicit) {
      rejectionReason = "missing_strong_domain_signal";
    } else if (accepted.length >= MAX_INFERRED_FIELDS) {
      rejectionReason = "max_inferred_fields_reached";
    }

    if (rejectionReason) {
      const rejected = reject(candidate, rejectionReason);
      rejectedFields.push(rejected);
      blockedKeywords.add(candidate.sourceKeyword);
      logEvent("debug", "input_field_candidate_rejected", {
        field_name: candidate.fieldName,
        source_keyword: candidate.sourceKeyword,
        reason: rejectionReason,
        confidence: candidate.confidence,
      }, input.trace);
      continue;
    }

    const reason = explicit ?? candidate.reason;
    acceptedFields[candidate.fieldName] = {
      type: candidate.fieldType,
      description: candidate.description,
    };
    accepted.push({
      fieldName: candidate.fieldName,
      sourceKeyword: candidate.sourceKeyword,
      reason,
      confidence: candidate.confidence,
    });
    logEvent("debug", "input_field_candidate_accepted", {
      field_name: candidate.fieldName,
      source_keyword: candidate.sourceKeyword,
      reason,
      confidence: candidate.confidence,
    }, input.trace);
  }

  logEvent("info", "input_field_inference_completed", {
    accepted_count: accepted.length,
    rejected_count: rejectedFields.length,
  }, input.trace);

  return {
    acceptedFields,
    rejectedFields,
    inferenceAudit: {
      accepted,
      rejected: rejectedFields,
      blocked_keywords: [...blockedKeywords],
      total_candidates: input.candidateFields.length,
    },
  };
}
