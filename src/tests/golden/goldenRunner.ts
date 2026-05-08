import { buildSpecFromPlan } from "../../spec/builder/specBuilder.js";
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

  return { passed: failures.length === 0, failures };
}
