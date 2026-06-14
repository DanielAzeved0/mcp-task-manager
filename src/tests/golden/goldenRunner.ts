import { buildSpecFromPlan } from "../../spec/builder/specBuilder.js";
import { readFileSync } from "node:fs";
import { createDeterministicPlan } from "../../spec/planner/planDocument.js";
import { selectTemplate } from "../../spec/templates/registry.js";
import { classifyPromptDetailed } from "../../ai/router/semanticClassifier.js";
import { resolveTemplateComposition } from "../../spec/templates/composition.js";
import { enforceLearningBoundaries } from "../../spec/learning/learningBoundaryEngine.js";
import { validateProviderModel } from "../../governance/providers/providerRegistry.js";
import { classifyProviderError } from "../../governance/providers/providerErrorTaxonomy.js";
import { JsonStabilityError, parseStableJson } from "../../ai/json/llmRetryController.js";
import { compileSchemaAwarePrompt } from "../../ai/prompt/schemaAwarePromptCompiler.js";
import { enforceSchemaAuthority, SchemaAuthorityError } from "../../spec/contracts/schemaAuthorityGuard.js";
import { resolveSafeFallbackTemplate } from "../../spec/templates/safeFallbackResolver.js";
import {
  SemanticGovernanceError,
  shouldBlockHeuristicFieldInference,
  validateContextualInputs,
  validateSemanticContent,
  validateStrictOutputTypes,
} from "../../spec/governance/semanticGovernance.js";
import { hydrateInlineCodeBeforeRuntimeGate } from "../../spec/governance/runtimeInputHydration.js";
import { guardInputFieldInference } from "../../spec/inputFieldInferenceGuard.js";
import { resolveCodeContext } from "../../context/codeContextResolver.js";
import { extractInlineCode } from "../../context/inlineCodeExtractor.js";
import { getProviderHealth, recordProviderFailure } from "../../governance/providers/providerGovernance.js";
import {
  classifyArtifact,
  normalizeArtifactPath,
  parseSprintSummary,
  parseTerminalEvents,
  validateActivityEvent,
  validateAgentState,
  validateArtifactContent,
  validateContractContent,
  validateEvaluationDocument,
  validateQaResult,
  validateSprintProgressState,
  validateSprintSpecReference,
  validateWritableArtifactPath,
  WorkspaceArtifactError,
} from "../../infra/file-system/workspaceArtifacts.js";
import {
  approveCommandProposal,
  classifyCommandRisk,
  createPackageScriptProposals,
  recordCommandExecutionResult,
  summarizeToolExecution,
  validateCommandExecutionResult,
  validateCommandProposal,
  validateMcpToolCall,
  validateMcpToolResult,
} from "../../infra/mcp/toolExecutionHarness.js";
import {
  findRelatedSprintArtifacts,
  validateDecisionNoteInput,
  validateMemoryDocument,
  validateMemorySearchQuery,
  LocalMemoryError,
} from "../../infra/file-system/localMemory.js";
import {
  CliError,
  formatCliStatus,
  formatDoctorChecks,
  parseCliCommand,
  validateEssentialScripts,
  validatePackageMetadata,
} from "../../cli/cliCore.js";
import {
  MvpReadinessError,
  assertRequiredReadmeSections,
  calculateReadinessScore,
  deriveReadinessStatus,
  validateMvpReadinessReport,
} from "../../core/mvp/readiness.js";

const GOLDEN_CASES = [
  {
    input: "analyze security flaws",
    expected_intent: "security_analysis",
    must_contain: ["vulnerabilities", "severity", "remediation"],
  },
  {
    input: "create architecture spec for AI observability system",
    expected_intent: "architecture_design",
    must_contain: ["components", "data_flow", "risks"],
  },
  {
    input: "spec para alterar cor de botao",
    expected_intent: "frontend_component",
    must_not_match: ["api_design", "database_design"],
    must_contain: ["ui_structure", "styles"],
  },
  {
    input: "quero uma spec para analisar os pontos fortes de um codigo",
    expected_intent: "code_analysis",
    must_not_match: ["api_design", "testing_strategy", "database_design"],
    must_contain: ["strengths", "good_practices", "improvement_opportunities", "maintainability_score"],
  },
  {
    input: "fa\u00e7a uma an\u00e1lise da qualidade do meu c\u00f3digo",
    expected_intent: "code_analysis",
    must_contain: ["strengths", "weaknesses", "summary"],
  },
  {
    input: "quero ver vulnerabilidades de seguran\u00e7a no meu c\u00f3digo",
    expected_intent: "security_analysis",
    must_contain: ["vulnerabilities", "severity", "remediation"],
  },
  {
    input: "crie uma spec para endpoints de uma API REST",
    expected_intent: "api_design",
    must_contain: ["endpoints", "request_schema", "response_schema"],
  },
  {
    input: "change css button style",
    expected_intent: "frontend_component",
    must_contain: ["ui_structure", "styles"],
  },
  {
    input: "design secure api gateway",
    expected_intent: "security_analysis",
    must_contain: ["auth_requirements", "observability", "vulnerabilities"],
  },
  {
    input: "QUERO UMA SPEC QUE ANALISE O MEU CODIGO",
    expected_intent: "code_analysis",
    must_not_match: ["code_refactor", "api_design"],
    must_contain: ["strengths", "weaknesses", "good_practices", "improvement_opportunities", "maintainability_score"],
  },
  {
    input: "quero refatorar meu c\u00f3digo com boas pr\u00e1ticas",
    expected_intent: "code_refactor",
    must_contain: ["refactor_plan", "module_boundaries", "tests"],
  },
  {
    input: "refatore os endpoints dessa api sem mudar o contrato",
    expected_intent: "code_refactor",
    must_not_match: ["api_design", "general_spec"],
    must_contain: ["refactor_plan", "module_boundaries", "tests"],
  },
  {
    input: "reestruturar modulo legado e remover duplicacao",
    expected_intent: "code_refactor",
    must_not_match: ["api_design", "code_analysis"],
    must_contain: ["refactor_plan", "compatibility_notes", "tests"],
  },
  {
    input: "quero ver vulnerabilidades no meu c\u00f3digo",
    expected_intent: "security_analysis",
    must_contain: ["vulnerabilities", "severity", "remediation"],
  },
  {
    input: "crie endpoints para uma API REST",
    expected_intent: "api_design",
    must_contain: ["endpoints", "request_schema", "response_schema"],
  },
];

export function runGoldenSuite(): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  for (const testCase of GOLDEN_CASES) {
    const classification = classifyPromptDetailed(testCase.input);
    if (classification.semantic_intent !== testCase.expected_intent) {
      failures.push(`${testCase.input}: expected intent '${testCase.expected_intent}', received '${classification.semantic_intent}'`);
    }
    if (testCase.must_not_match?.includes(classification.semantic_intent)) {
      failures.push(`${testCase.input}: matched forbidden intent '${classification.semantic_intent}'`);
    }

    const template = selectTemplate(classification.semantic_intent);
    const plan = createDeterministicPlan({
      intent: classification.semantic_intent,
      requiredInputs: template.inputs,
      requiredOutputs: template.outputs,
      riskLevel: classification.risk_level,
      suggestedTemplate: template.id,
    });
    const spec = buildSpecFromPlan(plan, testCase.input);
    const outputs = Object.keys(spec.output_fields);

    for (const required of testCase.must_contain) {
      if (!outputs.includes(required)) {
        failures.push(`${testCase.input}: missing output '${required}'`);
      }
    }
  }

  const invalidGeminiModel = ["gemini", "9.9", "ghost"].join("-");
  const invalidGemini = validateProviderModel("gemini", invalidGeminiModel, ["json_generation"]);
  if (invalidGemini.valid) {
    failures.push("must_reject_invalid_model: deprecated Gemini flash model should be rejected by registry");
  }

  const deprecatedGemini = validateProviderModel("gemini", "gemini-2.0-flash", ["json_generation"]);
  if (deprecatedGemini.valid) {
    failures.push("must_reject_gemini_2_0_flash: deprecated Gemini 2.0 flash should be rejected by registry");
  }

  const deprecatedError = classifyProviderError(new Error("models/gemini-2.0-flash is no longer available to new users"));
  if (deprecatedError.type !== "model_deprecated" || deprecatedError.action !== "try_next_model" || deprecatedError.affectsReliability) {
    failures.push("deprecated_gemini_model_failover: expected model_deprecated without reliability impact");
  }

  const quotaError = classifyProviderError(new Error("exceeded monthly spending cap"));
  if (quotaError.type !== "quota_exceeded" || quotaError.action !== "mark_quota_exhausted" || quotaError.affectsReliability) {
    failures.push("quota_error_not_reliability_failure: expected quota_exceeded without reliability impact");
  }

  const analyzeClassification = classifyPromptDetailed("codigo analise avaliar");
  if (!analyzeClassification.classification_trace.ambiguity_detected || analyzeClassification.classification_trace.action_intent !== "code_analysis") {
    failures.push("analyze_code_gap_resolution: expected ambiguity trace resolved by action router");
  }

  const refactorClassification = classifyPromptDetailed("refatore os endpoints dessa api sem mudar o contrato");
  if (refactorClassification.semantic_intent !== "code_refactor") {
    failures.push("refactor_intent_priority_must_override_api_terms: expected code_refactor for refactor API prompt");
  }
  if (refactorClassification.classification_trace.prioritization?.priority_intent !== "code_refactor") {
    failures.push("refactor_intent_priority_must_be_auditable: missing code_refactor prioritization trace");
  }
  if ((refactorClassification.classification_trace.negative_penalties.api_design ?? 0) >= 0) {
    failures.push("refactor_intent_priority_must_penalize_api_design: missing api_design penalty");
  }

  const refactorTemplate = selectTemplate("code_refactor");
  const compiledRefactorPrompt = compileSchemaAwarePrompt({
    sourceRequest: "refatore esse codigo para melhorar a legibilidade",
    semanticIntent: "code_refactor",
    templateId: refactorTemplate.id,
    inputFields: refactorTemplate.contract.input_fields,
    outputFields: refactorTemplate.contract.output_fields as any,
    strictJson: true,
  }).compiledPrompt;
  for (const expected of [
    "refactor_plan must be an array",
    "compatibility_notes must be an array",
    "tests must be an array",
    "module_boundaries must be an object",
    "Return only JSON",
    "Root object must contain only content",
    "Do not include prompt_spec",
    "Do not include metadata",
  ]) {
    if (!compiledRefactorPrompt.includes(expected)) {
      failures.push(`schema_aware_prompt_code_refactor_contract: missing '${expected}'`);
    }
  }

  const analysisTemplate = selectTemplate("code_analysis");
  const compiledAnalysisPrompt = compileSchemaAwarePrompt({
    sourceRequest: "quero que vc analise esse codigo",
    semanticIntent: "code_analysis",
    templateId: analysisTemplate.id,
    inputFields: analysisTemplate.contract.input_fields,
    outputFields: analysisTemplate.contract.output_fields as any,
    strictJson: true,
  }).compiledPrompt;
  for (const expected of [
    "strengths must be an array",
    "good_practices must be an array",
    "weaknesses must be an array",
    "improvement_opportunities must be an array",
    "maintainability_score must be a number",
  ]) {
    if (!compiledAnalysisPrompt.includes(expected)) {
      failures.push(`schema_aware_prompt_code_analysis_contract: missing '${expected}'`);
    }
  }

  const refactorInputTemplate = selectTemplate("code_refactor");
  const weakInference = guardInputFieldInference({
    sourceRequest: "refatore esse codigo para melhorar a legibilidade",
    semanticIntent: "code_refactor",
    domain: "code",
    task: "refactor",
    templateInputFields: refactorInputTemplate.contract.input_fields,
    candidateFields: [
      {
        fieldName: "code",
        fieldType: "string",
        description: "Code inferred from weak keyword",
        sourceKeyword: "esse",
        reason: "learned_domain_keyword",
        confidence: 0.41,
      },
      {
        fieldName: "component_name",
        fieldType: "string",
        description: "Component inferred from weak keyword",
        sourceKeyword: "para",
        reason: "learned_domain_keyword",
        confidence: 0.35,
      },
      {
        fieldName: "language",
        fieldType: "string",
        description: "Language inferred from weak keyword",
        sourceKeyword: "esse",
        reason: "learned_domain_keyword",
        confidence: 0.41,
      },
    ],
  });
  if (Object.keys(weakInference.acceptedFields).length > 0) {
    failures.push("input_field_guard_must_reject_weak_stopword_candidates: weak candidates accepted");
  }
  for (const keyword of ["esse", "para"]) {
    if (!weakInference.inferenceAudit.blocked_keywords.includes(keyword)) {
      failures.push(`input_field_guard_must_audit_blocked_keyword: missing '${keyword}'`);
    }
  }
  for (const field of ["code_area", "goals"]) {
    if (!refactorInputTemplate.contract.input_fields[field]) {
      failures.push(`input_field_guard_must_keep_template_fields_for_code_refactor: missing '${field}'`);
    }
  }

  const languageInference = guardInputFieldInference({
    sourceRequest: "refatore esse controller em TypeScript",
    semanticIntent: "code_refactor",
    domain: "code",
    task: "refactor",
    templateInputFields: refactorInputTemplate.contract.input_fields,
    candidateFields: [
      {
        fieldName: "language",
        fieldType: "string",
        description: "Programming language explicitly mentioned by the user",
        sourceKeyword: "TypeScript",
        reason: "explicit_language_signal",
        confidence: 0.91,
      },
    ],
  });
  if (!languageInference.acceptedFields.language) {
    failures.push("input_field_guard_must_accept_explicit_language_signal: language rejected");
  }
  if (!languageInference.inferenceAudit.accepted.some((item) => item.reason === "explicit_language_signal")) {
    failures.push("input_field_guard_must_audit_explicit_language_signal: reason missing");
  }

  const scopeInference = guardInputFieldInference({
    sourceRequest: "analise esse codigo focando em seguranca",
    semanticIntent: "code_analysis",
    domain: "code",
    task: "analyze",
    templateInputFields: { code: analysisTemplate.contract.input_fields.code, language: analysisTemplate.contract.input_fields.language },
    candidateFields: [
      {
        fieldName: "analysis_scope",
        fieldType: "string",
        description: "Analysis focus explicitly mentioned by the user",
        sourceKeyword: "seguranca",
        reason: "explicit_analysis_scope_signal",
        confidence: 0.87,
      },
    ],
  });
  if (!scopeInference.acceptedFields.analysis_scope) {
    failures.push("input_field_guard_must_accept_explicit_analysis_scope: analysis_scope rejected");
  }

  const syntheticContext = resolveCodeContext({
    sourceRequest: "refatore o auth controller",
    semanticIntent: "code_refactor",
    workspaceFiles: [
      {
        path: "src/controllers/auth.controller.ts",
        content: "import { AuthService } from '../services/auth.service';\nexport class AuthController { constructor(private auth: AuthService) {} }",
      },
      {
        path: "src/services/auth.service.ts",
        content: "export class AuthService { login() { return true; } }",
      },
      {
        path: "src/services/billing.service.ts",
        content: "export class BillingService {}",
      },
    ],
  });
  const selectedSyntheticFiles = syntheticContext.selectedFiles.map((file) => file.path);
  for (const expected of ["src/controllers/auth.controller.ts", "src/services/auth.service.ts"]) {
    if (!selectedSyntheticFiles.includes(expected)) {
      failures.push(`code_context_resolver_must_select_related_refactor_files: missing '${expected}'`);
    }
  }
  if (syntheticContext.tokenEstimate >= 12000) {
    failures.push("code_pack_builder_must_limit_codepack_size: token estimate exceeded limit");
  }

  const promptWithCodeContext = compileSchemaAwarePrompt({
    sourceRequest: "refatore esse endpoint",
    semanticIntent: "code_refactor",
    templateId: refactorTemplate.id,
    inputFields: refactorTemplate.contract.input_fields,
    outputFields: refactorTemplate.contract.output_fields as any,
    strictJson: true,
    codeContext: syntheticContext.codePack,
  }).compiledPrompt;
  if (!promptWithCodeContext.includes("CODE_CONTEXT")) {
    failures.push("schema_aware_prompt_must_inject_code_context: CODE_CONTEXT missing");
  }

  const markdownInline = extractInlineCode("refatore esse codigo para melhorar a legibilidade\n```ts\nfunction test() { return true; }\n```", "code_refactor");
  if (!markdownInline.hasInlineCode || markdownInline.inlineFiles[0]?.virtualPath !== "inline_prompt_1.ts") {
    failures.push("inline_code_extractor_must_detect_markdown_typescript_block: inline ts block not detected");
  }
  const markdownContext = resolveCodeContext({
    sourceRequest: "refatore esse codigo para melhorar a legibilidade\n```ts\nfunction test() { return true; }\n```",
    semanticIntent: "code_refactor",
    workspaceFiles: [],
  });
  if (!markdownContext.selectedFiles.some((file) => file.path === "inline_prompt_1.ts")) {
    failures.push("inline_code_context_must_select_virtual_markdown_file: inline_prompt_1.ts missing");
  }

  const refactorGateHydrated = hydrateInlineCodeBeforeRuntimeGate({
    sourceRequest: "refatore esse codigo\n```ts\nfunction test() { return true; }\n```",
    semanticIntent: "code_refactor",
    inputs: {},
  });
  try {
    validateContextualInputs("code_refactor", refactorGateHydrated.inputs);
  } catch {
    failures.push("inline_code_pre_gate_must_allow_code_refactor_with_inline_code: gate blocked hydrated code");
  }
  if (!refactorGateHydrated.hydrated || refactorGateHydrated.inputs.code_source !== "inline_prompt") {
    failures.push("inline_code_pre_gate_must_add_inline_metadata_for_code_refactor: metadata missing");
  }

  const singleInputRefactor = hydrateInlineCodeBeforeRuntimeGate({
    sourceRequest: "refatore esse codigo para melhorar a legibilidade\n\nfunction processarUsuarios(users: any[]) { let resultado: any[] = []; return resultado; }",
    semanticIntent: "code_refactor",
    inputs: {},
  });
  try {
    validateContextualInputs("code_refactor", singleInputRefactor.inputs);
  } catch {
    failures.push("single_input_refactor_with_inline_code_must_pass_gate: gate blocked unified prompt");
  }
  if (!singleInputRefactor.hydrated || !singleInputRefactor.inlineFiles.includes("inline_prompt_1.ts")) {
    failures.push("single_input_refactor_with_inline_code_must_create_inline_file: inline file missing");
  }

  const refactorGateMissing = hydrateInlineCodeBeforeRuntimeGate({
    sourceRequest: "refatore esse codigo para melhorar a legibilidade",
    semanticIntent: "code_refactor",
    inputs: {},
  });
  try {
    validateContextualInputs("code_refactor", refactorGateMissing.inputs);
    failures.push("inline_code_pre_gate_must_keep_blocking_code_refactor_without_code: missing code accepted");
  } catch (error) {
    if (!(error instanceof SemanticGovernanceError) || error.errorCode !== "missing_required_input") {
      failures.push("inline_code_pre_gate_must_keep_blocking_code_refactor_without_code: wrong error type");
    }
  }

  const analysisGateHydrated = hydrateInlineCodeBeforeRuntimeGate({
    sourceRequest: "analise esse codigo\nconst total: number = 1;\nfunction sum() { return total; }",
    semanticIntent: "code_analysis",
    inputs: {},
  });
  try {
    validateContextualInputs("code_analysis", analysisGateHydrated.inputs);
  } catch {
    failures.push("inline_code_pre_gate_must_allow_code_analysis_with_inline_code: gate blocked hydrated code");
  }

  const plainSnippetContext = resolveCodeContext({
    sourceRequest: "refatore esse codigo\nfunction processarUsuarios(users: any[]) { let resultado = []; return resultado; }",
    semanticIntent: "code_refactor",
    workspaceFiles: [],
  });
  if (!plainSnippetContext.inline.hasInlineCode || plainSnippetContext.inline.languages[0] !== "typescript") {
    failures.push("inline_code_extractor_must_detect_plain_typescript_snippet: plain snippet not detected as typescript");
  }
  if (plainSnippetContext.selectedFiles.length !== 1 || plainSnippetContext.selectedFiles[0].path !== "inline_prompt_1.ts") {
    failures.push("inline_code_context_must_build_codepack_from_plain_snippet: virtual file missing");
  }

  const jsonInline = extractInlineCode('refatore esse json\n{"active_port":3000,"server_status":"running"}', "code_refactor");
  if (!jsonInline.hasInlineCode || jsonInline.inlineFiles[0]?.language !== "json" || jsonInline.inlineFiles[0]?.virtualPath !== "inline_prompt_1.json") {
    failures.push("inline_code_extractor_must_detect_json_payload: json payload not detected");
  }

  const noInline = resolveCodeContext({
    sourceRequest: "refatore esse codigo para melhorar a legibilidade",
    semanticIntent: "code_refactor",
    workspaceFiles: [],
  });
  if (noInline.inline.hasInlineCode || noInline.selectedFiles.length !== 0) {
    failures.push("inline_code_extractor_must_not_detect_plain_prompt_as_code: plain prompt detected as code");
  }

  const frontendClassification = classifyPromptDetailed("create frontend component with database tables and indexes");
  const frontendComposition = resolveTemplateComposition("create frontend component with database tables and indexes", {
    ...frontendClassification,
    semantic_intent: "frontend_component",
  });
  if (frontendComposition.templates.some((template) => template.id === "database_design")) {
    failures.push("frontend_prompt_must_not_compose_database: database_design composed into frontend_component");
  }

  const learnedFrontend = enforceLearningBoundaries({
    task_instruction: "Create UI",
    input_fields: {
      component_name: { type: "string", description: "Component name" },
    },
    output_fields: {
      ui_structure: { type: "object", description: "UI structure" },
      tables: { type: "array", description: "Leaked database tables" },
    },
  }, "frontend_component");
  if (learnedFrontend.spec.output_fields.tables) {
    failures.push("frontend_learning_must_not_generate_tables: blocked output survived boundary enforcement");
  }

  const learnedCodeAnalysis = enforceLearningBoundaries({
    task_instruction: "Analyze code",
    input_fields: {
      code: { type: "string", description: "Code to analyze" },
    },
    output_fields: {
      strengths: { type: "array", description: "Code strengths" },
      endpoints: { type: "array", description: "Leaked API endpoints" },
    },
  }, "code_analysis");
  if (learnedCodeAnalysis.spec.output_fields.endpoints) {
    failures.push("code_analysis_learning_must_not_generate_endpoints: blocked output survived boundary enforcement");
  }

  const fenced = parseStableJson<{ task_instruction: string }>('```json\n{"task_instruction":"ok"}\n```');
  if (fenced.parsed.task_instruction !== "ok") {
    failures.push("json_sanitizer_must_remove_markdown_fences: failed to parse fenced JSON");
  }

  const withTrailingText = parseStableJson<{ task_instruction: string }>('Here is JSON: {"task_instruction":"ok"} extra explanation');
  if (withTrailingText.parsed.task_instruction !== "ok") {
    failures.push("json_extractor_must_strip_surrounding_text: failed to extract JSON object");
  }

  const repaired = parseStableJson<{ task_instruction: string }>('{"task_instruction":"ok",}');
  if (repaired.parsed.task_instruction !== "ok" || !repaired.autoFixed) {
    failures.push("json_repair_must_remove_trailing_comma: failed to auto repair");
  }

  try {
    parseStableJson('{"task_instruction":"unterminated"');
    failures.push("json_truncation_must_be_rejected: truncated JSON parsed unexpectedly");
  } catch (error) {
    if (!(error instanceof JsonStabilityError) || error.type !== "truncated_output") {
      failures.push("json_truncation_must_be_classified: expected truncated_output error");
    }
  }

  const codeTemplate = selectTemplate("code_analysis");
  const validContent = enforceSchemaAuthority({
    content: {
      strengths: ["clear structure"],
      weaknesses: ["needs tests"],
      summary: "Review summary",
    },
  }, codeTemplate);
  if (!validContent.strengths) {
    failures.push("contract_guard_must_accept_content_only_payload: valid content was rejected");
  }

  try {
    enforceSchemaAuthority({
      intent: "code_refactor",
      required_outputs: ["refactor_plan"],
      content: {
        strengths: ["clear structure"],
      },
    }, codeTemplate);
    failures.push("contract_guard_must_reject_structural_override: forbidden root keys accepted");
  } catch (error) {
    if (!(error instanceof SchemaAuthorityError) || !error.violations.includes("forbidden_key_detected")) {
      failures.push("contract_guard_must_report_forbidden_key: wrong violation type");
    }
  }

  try {
    enforceSchemaAuthority({
      content: {
        strengths: ["clear structure"],
        refactor_plan: ["rewrite modules"],
      },
    }, codeTemplate);
    failures.push("contract_guard_must_reject_extra_content_key: extra content key accepted");
  } catch (error) {
    if (!(error instanceof SchemaAuthorityError) || !error.violations.includes("extra_content_key")) {
      failures.push("contract_guard_must_report_extra_content_key: wrong violation type");
    }
  }

  try {
    validateContextualInputs("code_analysis", {});
    failures.push("code_analysis_without_code_should_fail: missing code accepted");
  } catch (error) {
    if (!(error instanceof SemanticGovernanceError) || error.errorCode !== "missing_required_input") {
      failures.push("code_analysis_without_code_should_fail: wrong error type");
    }
  }

  const geminiBeforeUserError = getProviderHealth("gemini").reliability;
  recordProviderFailure("gemini", 0, { affectsReliability: false });
  const geminiAfterUserError = getProviderHealth("gemini").reliability;
  if (geminiAfterUserError !== geminiBeforeUserError) {
    failures.push("strict_output_violation_does_not_reduce_reliability: reliability changed for isolated user error");
  }

  const llamaBeforeTimeout = getProviderHealth("llama").reliability;
  recordProviderFailure("llama", 0, { affectsReliability: true });
  const llamaAfterTimeout = getProviderHealth("llama").reliability;
  if (llamaAfterTimeout >= llamaBeforeTimeout) {
    failures.push("provider_timeout_reduces_reliability: timeout did not reduce reliability");
  }

  try {
    validateSemanticContent("code_analysis", {
      strengths: [{ title: "Base", description: "base funcional existente", evidence: "a ser determinado" }],
      weaknesses: [{ title: "Risk", description: "pode melhorar", evidence: "potencial para melhoria" }],
    });
    failures.push("code_analysis_with_generic_content_should_fail: generic content accepted");
  } catch (error) {
    if (!(error instanceof SemanticGovernanceError) || error.errorCode !== "semantic_violation") {
      failures.push("code_analysis_with_generic_content_should_fail: wrong error type");
    }
  }

  const closeGap = classifyPromptDetailed("codigo analise avaliar");
  if (!closeGap.classification_trace.ambiguity_detected || closeGap.semantic_intent !== "code_analysis") {
    failures.push("confidence_gap_below_threshold_should_trigger_safe_intent: safe resolution not applied");
  }

  if (!shouldBlockHeuristicFieldInference("quero uma spec qualquer")) {
    failures.push("heuristic_learning_should_not_create_fields_from_quero: heuristic blocker did not trigger");
  }

  const apiFallback = resolveSafeFallbackTemplate({
    ...classifyPromptDetailed("crie endpoints para uma API REST"),
    semantic_intent: "api_design",
    confidence: 0.95,
  }, "no_candidate_backend");
  if (apiFallback.selectedFallbackTemplate === "api_design") {
    failures.push("fallback_should_not_default_to_api_design: api_design selected as fallback");
  }

  try {
    validateStrictOutputTypes(codeTemplate, { strengths: "string instead of array" });
    failures.push("strict_output_validation_should_reject_string_for_array: string accepted for array field");
  } catch (error) {
    if (!(error instanceof SemanticGovernanceError) || error.errorCode !== "strict_output_violation") {
      failures.push("strict_output_validation_should_reject_string_for_array: wrong error type");
    }
  }

  const normalizedArtifactPath = normalizeArtifactPath(".mcp-task\\sprints\\roadmap.md");
  if (normalizedArtifactPath !== ".mcp-task/sprints/roadmap.md") {
    failures.push("workspace_path_normalization_should_use_posix_paths: path was not normalized");
  }

  for (const unsafePath of ["../AGENTS.md", ".mcp-task/../AGENTS.md", "C:/tmp/secret.md", "/tmp/secret.md"]) {
    try {
      normalizeArtifactPath(unsafePath);
      failures.push(`workspace_path_guard_should_reject_${unsafePath}: unsafe path accepted`);
    } catch (error) {
      if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_artifact_path") {
        failures.push(`workspace_path_guard_should_classify_${unsafePath}: wrong error type`);
      }
    }
  }

  try {
    normalizeArtifactPath(".mcp-task/sprints/archive.exe");
    failures.push("workspace_path_guard_should_reject_unsupported_extension: exe accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "unsupported_artifact_type") {
      failures.push("workspace_path_guard_should_classify_unsupported_extension: wrong error type");
    }
  }

  if (classifyArtifact(".mcp-task/sprints/roadmap.md") !== "roadmap") {
    failures.push("workspace_artifact_classifier_should_detect_roadmap: roadmap not detected");
  }

  if (classifyArtifact(".mcp-task/contracts/sprint-002-file-backed-runtime.md") !== "contract") {
    failures.push("workspace_artifact_classifier_should_detect_contract: contract not detected");
  }

  if (classifyArtifact(".mcp-task/agents/agents.json") !== "agent") {
    failures.push("workspace_artifact_classifier_should_detect_agent_state: agent state not detected");
  }

  if (classifyArtifact(".mcp-task/progress/sprint-005.json") !== "progress") {
    failures.push("workspace_artifact_classifier_should_detect_progress_state: progress state not detected");
  }

  if (classifyArtifact(".mcp-task/qa/sprint-006-qa.json") !== "qa") {
    failures.push("workspace_artifact_classifier_should_detect_qa_result: qa result not detected");
  }

  if (validateWritableArtifactPath(".mcp-task/specs/sprint-003-spec-authoring.md") !== "spec") {
    failures.push("workspace_write_guard_should_allow_spec_markdown: spec path rejected");
  }

  if (validateWritableArtifactPath(".mcp-task/sprints/sprint-003-spec-sprint-authoring.md") !== "sprint") {
    failures.push("workspace_write_guard_should_allow_sprint_markdown: sprint path rejected");
  }

  if (validateWritableArtifactPath(".mcp-task/contracts/sprint-004-contract-gatekeeping.md") !== "contract") {
    failures.push("workspace_write_guard_should_allow_contract_markdown: contract path rejected");
  }

  for (const forbiddenWritePath of [
    ".mcp-task/evaluations/sprint-003-evaluation.json",
    ".mcp-task/logs/sprint-003.md",
    ".mcp-task/memory/project.json",
    ".mcp-task/sprints/roadmap.md",
  ]) {
    try {
      validateWritableArtifactPath(forbiddenWritePath);
      failures.push(`workspace_write_guard_should_reject_${forbiddenWritePath}: forbidden write path accepted`);
    } catch (error) {
      if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_artifact_path") {
        failures.push(`workspace_write_guard_should_classify_${forbiddenWritePath}: wrong error type`);
      }
    }
  }

  const validContract = [
    "# Contract - SPRINT-004 Contract Builder and Gatekeeping",
    "## sprint_id",
    "`SPRINT-004`",
    "## objective",
    "Create a Contract gate.",
    "## allowed_changes",
    "- Add Contract validation.",
    "## forbidden_changes",
    "- Do not execute Build.",
    "## acceptance_criteria",
    "- Build is blocked without Contract.",
    "## qa_checklist",
    "- [ ] Validate gate.",
    "## expected_outputs",
    "- Contract gate summary.",
    "## rollback_notes",
    "Remove Contract gate.",
  ].join("\n\n");
  const validContractResult = validateContractContent(validContract, "SPRINT-004");
  if (!validContractResult.valid || validContractResult.missingFields.length > 0) {
    failures.push("contract_gate_validator_should_accept_complete_contract: valid Contract rejected");
  }

  const invalidContractResult = validateContractContent("# Contract\n\n## sprint_id\n\n`SPRINT-004`", "SPRINT-004");
  for (const missingField of ["objective", "allowed_changes", "forbidden_changes", "acceptance_criteria", "qa_checklist", "expected_outputs", "rollback_notes"]) {
    if (!invalidContractResult.missingFields.includes(missingField)) {
      failures.push(`contract_gate_validator_should_report_missing_${missingField}: field not reported`);
    }
  }

  const validAgent = validateAgentState({
    name: "Builder",
    role: "Builder",
    goal: "Implement Contract scope.",
    allowed_actions: ["edit_allowed_files"],
    forbidden_actions: ["self_validate_completion"],
    inputs: ["contract"],
    outputs: ["implementation"],
    status: "active",
  });
  if (validAgent.role !== "Builder" || validAgent.status !== "active") {
    failures.push("agent_state_validator_should_accept_valid_builder: valid Builder rejected");
  }

  try {
    validateAgentState({ name: "Runner", role: "Runner", goal: "Run", allowed_actions: [], forbidden_actions: [], inputs: [], outputs: [], status: "active" });
    failures.push("agent_state_validator_should_reject_invalid_role: invalid role accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_agent_state") {
      failures.push("agent_state_validator_should_classify_invalid_role: wrong error type");
    }
  }

  const validEvent = validateActivityEvent({
    id: "evt-1",
    sprintId: "SPRINT-005",
    agent: "Builder",
    type: "progressed",
    message: "Updated local progress.",
    timestamp: "2026-06-13T14:45:00.000Z",
    artifactPath: ".mcp-task/progress/sprint-005.json",
  });
  if (validEvent.artifactPath !== ".mcp-task/progress/sprint-005.json") {
    failures.push("activity_event_validator_should_accept_safe_artifact_path: safe artifact rejected");
  }

  try {
    validateActivityEvent({
      id: "evt-unsafe",
      sprintId: "SPRINT-005",
      agent: "Builder",
      type: "progressed",
      message: "Bad path.",
      timestamp: "2026-06-13T14:45:00.000Z",
      artifactPath: "../secret.md",
    });
    failures.push("activity_event_validator_should_reject_unsafe_artifact_path: unsafe path accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_artifact_path") {
      failures.push("activity_event_validator_should_classify_unsafe_artifact_path: wrong error type");
    }
  }

  try {
    validateActivityEvent({
      id: "evt-bad-time",
      sprintId: "SPRINT-005",
      agent: "Builder",
      type: "progressed",
      message: "Bad timestamp.",
      timestamp: "not-a-date",
    });
    failures.push("activity_event_validator_should_reject_invalid_timestamp: invalid timestamp accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_event") {
      failures.push("activity_event_validator_should_classify_invalid_timestamp: wrong error type");
    }
  }

  const progress = validateSprintProgressState({
    sprintId: "SPRINT-005",
    stage: "Build",
    status: "building",
    updatedAt: "2026-06-13T14:45:00.000Z",
    agents: [validAgent],
    events: [validEvent],
  });
  if (progress.events.length !== 1 || progress.agents.length !== 1) {
    failures.push("progress_state_validator_should_accept_agents_and_events: progress mismatch");
  }

  try {
    validateSprintProgressState({
      sprintId: "SPRINT-005",
      stage: "Deploy",
      status: "building",
      updatedAt: "2026-06-13T14:45:00.000Z",
      agents: [],
      events: [],
    });
    failures.push("progress_state_validator_should_reject_invalid_stage: invalid stage accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_progress_state") {
      failures.push("progress_state_validator_should_classify_invalid_stage: wrong error type");
    }
  }

  const validQaResult = validateQaResult({
    sprintId: "SPRINT-006",
    contractPath: ".mcp-task/contracts/sprint-006-qa-evaluation-engine.md",
    status: "passed",
    validatedAt: "2026-06-13T15:55:00.000Z",
    items: [
      { id: "qa-001", label: "Contract path is safe.", status: "passed" },
      { id: "qa-002", label: "Score gate is enforced.", status: "passed" },
    ],
  });
  if (validQaResult.status !== "passed" || validQaResult.items.length !== 2) {
    failures.push("qa_result_validator_should_accept_complete_passed_result: valid QA rejected");
  }

  try {
    validateQaResult({
      sprintId: "SPRINT-006",
      contractPath: "../contracts/outside.md",
      status: "passed",
      validatedAt: "2026-06-13T15:55:00.000Z",
      items: [{ id: "qa-001", label: "Bad path.", status: "passed" }],
    });
    failures.push("qa_result_validator_should_reject_unsafe_contract_path: unsafe path accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_artifact_path") {
      failures.push("qa_result_validator_should_classify_unsafe_contract_path: wrong error type");
    }
  }

  try {
    validateQaResult({
      sprintId: "SPRINT-006",
      contractPath: ".mcp-task/contracts/sprint-006-qa-evaluation-engine.md",
      status: "passed",
      validatedAt: "2026-06-13T15:55:00.000Z",
      items: [{ id: "qa-001", label: "Failed criterion.", status: "failed" }],
    });
    failures.push("qa_result_validator_should_reject_status_mismatch: mismatch accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_qa_result") {
      failures.push("qa_result_validator_should_classify_status_mismatch: wrong error type");
    }
  }

  const validEvaluation = validateEvaluationDocument({
    sprintId: "SPRINT-006",
    status: "passed",
    score: 94,
    checks: {
      contractCompliance: true,
      architecture: true,
      simplicity: true,
      offlineSupport: true,
      uiConsistency: true,
      validation: true,
    },
    failures: [],
    recommendations: ["Keep QA explicit."],
  }, validQaResult);
  if (validEvaluation.score !== 94 || validEvaluation.status !== "passed") {
    failures.push("evaluation_validator_should_accept_score_above_threshold: valid Evaluation rejected");
  }

  try {
    validateEvaluationDocument({
      sprintId: "SPRINT-006",
      status: "passed",
      score: 89,
      checks: {
        contractCompliance: true,
        architecture: true,
        simplicity: true,
        offlineSupport: true,
        uiConsistency: true,
        validation: true,
      },
      failures: [],
      recommendations: [],
    }, validQaResult);
    failures.push("evaluation_validator_should_reject_passed_score_below_90: low score accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "evaluation_score_too_low") {
      failures.push("evaluation_validator_should_classify_low_score: wrong error type");
    }
  }

  try {
    validateEvaluationDocument({
      sprintId: "SPRINT-006",
      status: "passed",
      score: 94,
      checks: {
        contractCompliance: true,
        architecture: true,
        simplicity: true,
        offlineSupport: true,
        uiConsistency: true,
      },
      failures: [],
      recommendations: [],
    }, validQaResult);
    failures.push("evaluation_validator_should_reject_missing_validation_check: missing check accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_evaluation") {
      failures.push("evaluation_validator_should_classify_missing_check: wrong error type");
    }
  }

  try {
    validateWritableArtifactPath(".mcp-task/specs/authoring.json");
    failures.push("workspace_write_guard_should_reject_non_markdown_authoring: json accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "unsupported_artifact_type") {
      failures.push("workspace_write_guard_should_classify_non_markdown_authoring: wrong error type");
    }
  }

  try {
    validateArtifactContent("");
    failures.push("workspace_write_guard_should_reject_empty_content: empty content accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "invalid_artifact_content") {
      failures.push("workspace_write_guard_should_classify_empty_content: wrong error type");
    }
  }

  const sprintSpecPath = ".mcp-task/specs/sprint-003-spec-authoring.md";
  const sprintPlanWithSpec = `# Sprint SPRINT-003 - SPEC and Sprint Authoring Flow\n\n## Linked SPEC\n\n${sprintSpecPath}`;
  if (validateSprintSpecReference(sprintPlanWithSpec, sprintSpecPath) !== sprintSpecPath) {
    failures.push("workspace_sprint_plan_should_accept_linked_spec_path: linked SPEC rejected");
  }

  try {
    validateSprintSpecReference("# Sprint without linked spec", sprintSpecPath);
    failures.push("workspace_sprint_plan_should_require_spec_path_in_content: missing linked SPEC accepted");
  } catch (error) {
    if (!(error instanceof WorkspaceArtifactError) || error.code !== "missing_spec_reference") {
      failures.push("workspace_sprint_plan_should_classify_missing_spec_path: wrong error type");
    }
  }

  const sprintSummary = parseSprintSummary(
    ".mcp-task/sprints/sprint-002-file-backed-runtime.md",
    "# Sprint SPRINT-002 - File-Backed Workspace Runtime\n\n## Status\n\n`planned`",
  );
  if (sprintSummary.id !== "SPRINT-002" || sprintSummary.status !== "planned") {
    failures.push("workspace_sprint_parser_should_extract_id_and_status: sprint summary mismatch");
  }

  const terminalEvents = parseTerminalEvents("mcp-task> loading project context...\nmcp-task> evaluation score: 94%", ".mcp-task/logs/sprint-001.md");
  if (terminalEvents.length !== 2 || terminalEvents[1]?.level !== "ok") {
    failures.push("workspace_terminal_parser_should_extract_log_events: terminal events mismatch");
  }

  const scriptProposals = createPackageScriptProposals(
    {
      build: "tsc",
      "test:golden": "npm run build && node dist/tests/golden/goldenRunner.js",
      dev: "npm run fullstack",
    },
    "2026-06-13T21:00:00.000Z",
    "win32",
  );
  const proposalLabels = scriptProposals.map((proposal) => proposal.label);
  if (!proposalLabels.includes("npm run build") || !proposalLabels.includes("npm run test:golden") || proposalLabels.includes("npm run dev")) {
    failures.push("tool_harness_should_generate_validation_presets_from_package_scripts: preset mismatch");
  }
  if (scriptProposals.some((proposal) => proposal.command !== "npm.cmd" || proposal.riskLevel !== "low" || proposal.status !== "proposed")) {
    failures.push("tool_harness_should_create_safe_structured_npm_proposals: proposal shape mismatch");
  }

  if (classifyCommandRisk("npm.cmd", ["run", "clean"], "rm -rf dist") !== "blocked") {
    failures.push("tool_harness_should_block_destructive_package_script_body: destructive script not blocked");
  }

  const validCommandProposal = validateCommandProposal({
    id: "pkg-build",
    label: "npm run build",
    command: "npm.cmd",
    args: ["run", "build"],
    source: "package-script",
    riskLevel: "low",
    status: "proposed",
    createdAt: "2026-06-13T21:00:00.000Z",
  });
  if (validCommandProposal.args[1] !== "build") {
    failures.push("tool_harness_should_accept_valid_command_proposal: args mismatch");
  }

  try {
    validateCommandProposal({
      id: "pkg-clean",
      label: "npm run clean",
      command: "npm.cmd",
      args: ["run", "clean"],
      source: "package-script",
      riskLevel: "blocked",
      status: "approved",
      createdAt: "2026-06-13T21:00:00.000Z",
      approvedAt: "2026-06-13T21:01:00.000Z",
    });
    failures.push("tool_harness_should_reject_approved_blocked_command: blocked approval accepted");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Blocked command")) {
      failures.push("tool_harness_should_classify_approved_blocked_command: wrong error");
    }
  }

  try {
    recordCommandExecutionResult(
      {
        sprintId: "SPRINT-007",
        commands: [validCommandProposal],
        toolCalls: [],
        results: [],
      },
      {
        proposalId: "pkg-build",
        exitCode: 0,
        stdoutPreview: "ok",
        stderrPreview: "",
        startedAt: "2026-06-13T21:02:00.000Z",
        completedAt: "2026-06-13T21:02:01.000Z",
      },
    );
    failures.push("tool_harness_should_require_approval_before_execution: proposed command executed");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("approved")) {
      failures.push("tool_harness_should_classify_unapproved_execution: wrong error");
    }
  }

  const approvedState = approveCommandProposal(
    {
      sprintId: "SPRINT-007",
      commands: [validCommandProposal],
      toolCalls: [],
      results: [],
    },
    "pkg-build",
    "2026-06-13T21:01:00.000Z",
  );
  if (approvedState.commands[0]?.status !== "approved" || !approvedState.commands[0]?.approvedAt) {
    failures.push("tool_harness_should_persist_explicit_approval: approval missing");
  }

  const failedExecutionState = recordCommandExecutionResult(approvedState, {
    proposalId: "pkg-build",
    exitCode: 1,
    stdoutPreview: "",
    stderrPreview: "build failed",
    startedAt: "2026-06-13T21:02:00.000Z",
    completedAt: "2026-06-13T21:02:01.000Z",
  });
  const executionSummary = summarizeToolExecution(failedExecutionState);
  if (executionSummary.counts.failed !== 1 || executionSummary.failedCommands[0]?.id !== "pkg-build") {
    failures.push("tool_harness_should_surface_failed_commands: failed command missing");
  }

  const validExecutionResult = validateCommandExecutionResult({
    proposalId: "pkg-build",
    exitCode: 0,
    stdoutPreview: "build ok",
    stderrPreview: "",
    startedAt: "2026-06-13T21:02:00.000Z",
    completedAt: "2026-06-13T21:02:01.000Z",
  });
  if (validExecutionResult.exitCode !== 0) {
    failures.push("tool_harness_should_accept_valid_execution_result: result rejected");
  }

  const validToolCall = validateMcpToolCall({
    id: "tool-call-1",
    toolId: "local-command-runner",
    requestedByAgent: "QA",
    input: { proposalId: "pkg-build" },
    status: "proposed",
    createdAt: "2026-06-13T21:00:00.000Z",
  });
  if (validToolCall.toolId !== "local-command-runner") {
    failures.push("tool_harness_should_accept_registered_mcp_tool_call: tool call rejected");
  }

  try {
    validateMcpToolCall({
      id: "tool-call-2",
      toolId: "unknown-tool",
      requestedByAgent: "QA",
      input: {},
      status: "proposed",
      createdAt: "2026-06-13T21:00:00.000Z",
    });
    failures.push("tool_harness_should_reject_unknown_mcp_tool_call: unknown tool accepted");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("registered tool")) {
      failures.push("tool_harness_should_classify_unknown_mcp_tool_call: wrong error");
    }
  }

  const validToolResult = validateMcpToolResult({
    callId: "tool-call-1",
    ok: false,
    error: { code: "COMMAND_FAILED", message: "exit 1" },
    completedAt: "2026-06-13T21:03:00.000Z",
  });
  if (validToolResult.ok) {
    failures.push("tool_harness_should_accept_failed_mcp_tool_result: result mismatch");
  }

  const validMemoryDocument = validateMemoryDocument({
    id: "decision-local-memory",
    type: "decision",
    title: "Keep memory local",
    content: "Use Markdown files for project decisions.",
    tags: ["memory", "offline"],
    relatedSprintId: "SPRINT-008",
    relatedArtifactPaths: [".mcp-task/contracts/sprint-008-local-memory-history.md"],
    createdAt: "2026-06-14T02:30:00.000Z",
    updatedAt: "2026-06-14T02:30:00.000Z",
  });
  if (validMemoryDocument.type !== "decision" || validMemoryDocument.relatedSprintId !== "SPRINT-008") {
    failures.push("local_memory_should_accept_valid_memory_document: document mismatch");
  }

  try {
    validateMemoryDocument({
      ...validMemoryDocument,
      relatedArtifactPaths: ["../secret.md"],
    });
    failures.push("local_memory_should_reject_unsafe_related_artifact_path: unsafe path accepted");
  } catch (error) {
    if (!(error instanceof LocalMemoryError) || error.code !== "invalid_artifact_path") {
      failures.push("local_memory_should_classify_unsafe_related_artifact_path: wrong error");
    }
  }

  const validDecisionNote = validateDecisionNoteInput({
    title: "Local memory stays file-backed",
    content: "Decision notes are Markdown files under .mcp-task/memory/decisions/.",
    tags: ["decision"],
    relatedSprintId: "SPRINT-008",
    relatedArtifactPaths: [".mcp-task/specs/sprint-008-local-memory-history.md"],
  });
  if (validDecisionNote.relatedSprintId !== "SPRINT-008") {
    failures.push("local_memory_should_accept_valid_decision_note: note mismatch");
  }

  try {
    validateDecisionNoteInput({
      title: "Bad decision",
      content: "Bad path.",
      relatedArtifactPaths: ["C:/secret.md"],
    });
    failures.push("local_memory_should_reject_absolute_decision_path: absolute path accepted");
  } catch (error) {
    if (!(error instanceof LocalMemoryError) || error.code !== "invalid_artifact_path") {
      failures.push("local_memory_should_classify_absolute_decision_path: wrong error");
    }
  }

  const validSearchQuery = validateMemorySearchQuery({
    query: "contract",
    types: ["artifact", "decision"],
    sprintId: "SPRINT-008",
    limit: 5,
  });
  if (validSearchQuery.limit !== 5 || validSearchQuery.types?.length !== 2) {
    failures.push("local_memory_should_accept_valid_search_query: query mismatch");
  }

  try {
    validateMemorySearchQuery({ query: "contract", limit: 100 });
    failures.push("local_memory_should_reject_excessive_search_limit: high limit accepted");
  } catch (error) {
    if (!(error instanceof LocalMemoryError) || error.code !== "invalid_search_query") {
      failures.push("local_memory_should_classify_excessive_search_limit: wrong error");
    }
  }

  const relatedSprint008 = findRelatedSprintArtifacts("SPRINT-008", [
    ".mcp-task/sprints/sprint-008-local-memory-history.md",
    ".mcp-task/specs/sprint-008-local-memory-history.md",
    ".mcp-task/contracts/sprint-008-local-memory-history.md",
    ".mcp-task/qa/sprint-008-qa.json",
    ".mcp-task/evaluations/sprint-008-evaluation.json",
    ".mcp-task/progress/sprint-008.json",
    ".mcp-task/logs/sprint-008.md",
  ]);
  if (relatedSprint008.contractPath !== ".mcp-task/contracts/sprint-008-local-memory-history.md") {
    failures.push("local_memory_should_associate_related_sprint_artifacts: contract not associated");
  }

  const parsedStatus = parseCliCommand(["status"], "C:/repo", {});
  if (parsedStatus.name !== "status" || parsedStatus.cwd !== "C:/repo") {
    failures.push("cli_parser_should_accept_status_command: status parse mismatch");
  }

  const parsedHelp = parseCliCommand(["--help"], "C:/repo", {});
  if (parsedHelp.name !== "help") {
    failures.push("cli_parser_should_accept_help_flag: help flag mismatch");
  }

  try {
    parseCliCommand(["publish"], "C:/repo", {});
    failures.push("cli_parser_should_reject_unknown_command: unknown command accepted");
  } catch (error) {
    if (!(error instanceof CliError) || error.code !== "unknown_command" || error.exitCode !== 2) {
      failures.push("cli_parser_should_classify_unknown_command: wrong error");
    }
  }

  const statusOutput = formatCliStatus({
    productName: "MCP Harness Task Manager",
    shortName: "mcp-task",
    currentSprint: "SPRINT-009",
    sprintStatus: "building",
    contractReady: true,
    qaStatus: "missing",
    evaluationScore: null,
    doneBlocked: true,
    memoryDocuments: 2,
    toolCommands: 3,
  });
  for (const expected of ["mcp-task status", "Current sprint: SPRINT-009", "Contract: ready", "Done gate: blocked"]) {
    if (!statusOutput.includes(expected)) {
      failures.push(`cli_status_should_format_${expected}: missing output`);
    }
  }

  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    name: string;
    version: string;
    type: "module";
    bin?: Record<string, string>;
    scripts: Record<string, string>;
  };
  const packageCheck = validatePackageMetadata(packageJson);
  if (packageCheck.status !== "passed") {
    failures.push("cli_package_metadata_should_expose_mcp_task_bin: package metadata invalid");
  }
  for (const scriptCheck of validateEssentialScripts(packageJson.scripts)) {
    if (scriptCheck.status !== "passed") {
      failures.push(`cli_package_metadata_should_preserve_${scriptCheck.id}: script missing`);
    }
  }

  const doctorOutput = formatDoctorChecks([
    { id: "node-runtime", label: "node runtime available", status: "passed", message: "Node available" },
    { id: "package-json", label: "package.json found", status: "passed", message: "mcp-task@1.0.0" },
  ]);
  if (!doctorOutput.includes("[passed] node runtime available") || !doctorOutput.includes("mcp-task doctor")) {
    failures.push("cli_doctor_should_format_checks: doctor output mismatch");
  }

  const readinessChecks = [
    {
      id: "workspace-readable",
      category: "workspace",
      label: "Workspace readable",
      status: "passed",
      evidence: ".mcp-task loaded",
      required: true,
    },
    {
      id: "cli-local",
      category: "cli",
      label: "CLI local",
      status: "passed",
      evidence: "status and doctor passed",
      required: true,
    },
    {
      id: "visual-smoke",
      category: "ui",
      label: "Visual smoke",
      status: "warning",
      evidence: "manual visual QA remains",
      required: false,
    },
  ] as const;
  const readinessScore = calculateReadinessScore(readinessChecks as any);
  if (readinessScore !== 92 || deriveReadinessStatus(readinessScore, readinessChecks as any) !== "ready") {
    failures.push("mvp_readiness_should_calculate_ready_score_with_optional_warning: readiness mismatch");
  }

  const validReadiness = validateMvpReadinessReport({
    sprintId: "SPRINT-010",
    status: "ready",
    score: 94,
    generatedAt: "2026-06-14T03:25:00.000Z",
    checks: readinessChecks,
    risks: [
      {
        id: "manual-visual-qa",
        severity: "low",
        description: "Responsive UI still benefits from manual inspection.",
        mitigation: "Add browser smoke tests later.",
      },
    ],
    nextActions: ["Keep release work behind a publishing contract."],
  });
  if (validReadiness.status !== "ready" || validReadiness.score !== 94) {
    failures.push("mvp_readiness_should_accept_valid_ready_report: report mismatch");
  }

  try {
    validateMvpReadinessReport({
      sprintId: "SPRINT-010",
      status: "ready",
      score: 89,
      generatedAt: "2026-06-14T03:25:00.000Z",
      checks: readinessChecks,
      risks: [],
      nextActions: [],
    });
    failures.push("mvp_readiness_should_reject_ready_score_below_90: low score accepted");
  } catch (error) {
    if (!(error instanceof MvpReadinessError) || error.code !== "mvp_not_ready") {
      failures.push("mvp_readiness_should_classify_ready_score_below_90: wrong error");
    }
  }

  try {
    validateMvpReadinessReport({
      sprintId: "SPRINT-010",
      status: "ready",
      score: 95,
      generatedAt: "2026-06-14T03:25:00.000Z",
      checks: [
        {
          id: "workspace-readable",
          category: "workspace",
          label: "Workspace readable",
          status: "failed",
          evidence: ".mcp-task missing",
          required: true,
        },
      ],
      risks: [],
      nextActions: [],
    });
    failures.push("mvp_readiness_should_reject_ready_with_failed_required_check: failed check accepted");
  } catch (error) {
    if (!(error instanceof MvpReadinessError) || error.code !== "mvp_not_ready") {
      failures.push("mvp_readiness_should_classify_failed_required_check: wrong error");
    }
  }

  const readmeContent = readFileSync("README.md", "utf8");
  const missingReadmeSections = assertRequiredReadmeSections(readmeContent);
  if (missingReadmeSections.length) {
    failures.push(`mvp_readiness_should_require_readme_sections: missing ${missingReadmeSections.join(", ")}`);
  }

  return { passed: failures.length === 0, failures };
}
