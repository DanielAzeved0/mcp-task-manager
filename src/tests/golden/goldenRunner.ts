import { buildSpecFromPlan } from "../../spec/builder/specBuilder.js";
import { createDeterministicPlan } from "../../spec/planner/planDocument.js";
import { selectTemplate } from "../../spec/templates/registry.js";
import { classifyPromptDetailed } from "../../ai/router/semanticClassifier.js";
import { resolveTemplateComposition } from "../../spec/templates/composition.js";
import { enforceLearningBoundaries } from "../../spec/learning/learningBoundaryEngine.js";
import { validateProviderModel } from "../../governance/providers/providerRegistry.js";
import { classifyProviderError } from "../../governance/providers/providerErrorTaxonomy.js";

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

  const analyzeClassification = classifyPromptDetailed("QUERO UMA SPEC QUE ANALISE O MEU CODIGO");
  if (!analyzeClassification.classification_trace.ambiguity_detected || analyzeClassification.classification_trace.action_intent !== "code_analysis") {
    failures.push("analyze_code_gap_resolution: expected ambiguity trace resolved by action router");
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

  return { passed: failures.length === 0, failures };
}
