import { buildSpecFromPlan } from "../../spec/builder/specBuilder.js";
import { createDeterministicPlan } from "../../spec/planner/planDocument.js";
import { selectTemplate } from "../../spec/templates/registry.js";
import { classifyPromptDetailed } from "../../ai/router/semanticClassifier.js";

const GOLDEN_CASES = [
  {
    input: "analyze security flaws",
    must_contain: ["vulnerabilities", "severity", "remediation"],
  },
  {
    input: "create architecture spec for AI observability system",
    must_contain: ["components", "data_flow", "risks"],
  },
];

export function runGoldenSuite(): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  for (const testCase of GOLDEN_CASES) {
    const classification = classifyPromptDetailed(testCase.input);
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

  return { passed: failures.length === 0, failures };
}
