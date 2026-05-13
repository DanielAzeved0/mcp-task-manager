import { logEvent, type TraceContext } from "../../observability/logger.js";
import { resolveCompactOutputPolicy, type CompactOutputPolicy } from "./compactOutputPolicy.js";

export interface FieldDefinition {
  type: string;
  description?: string;
  items?: unknown;
  properties?: Record<string, unknown>;
}

export interface SchemaAwarePromptCompilerInput {
  sourceRequest: string;
  semanticIntent: string;
  templateId: string;
  inputFields: Record<string, unknown>;
  outputFields: Record<string, FieldDefinition>;
  strictJson: boolean;
  context?: string;
  codeContext?: string;
  semanticAnalysisContext?: string;
  previousErrors?: string[];
  attempt?: number;
  compactOutputPolicy?: CompactOutputPolicy;
  trace?: TraceContext;
}

export interface StructuralFieldContract {
  type: string;
  description: string;
  empty_value: unknown;
  rule: string;
}

export interface SchemaAwarePromptCompilerOutput {
  compiledPrompt: string;
  structuralContract: Record<string, StructuralFieldContract>;
  validExample: Record<string, unknown>;
  forbiddenPatterns: string[];
}

const FORBIDDEN_ROOT_FIELDS = [
  "prompt_spec",
  "metadata",
  "validation",
  "quality_score",
  "schema",
  "input_fields",
  "output_fields",
  "explanation",
  "intent",
  "template",
];

function emptyValueForType(type: string): unknown {
  if (type === "array") return [];
  if (type === "object") return {};
  if (type === "number") return 0;
  if (type === "boolean") return false;
  return "";
}

function ruleForType(fieldName: string, type: string): string {
  if (type === "array") return `${fieldName} must be an array. Always return a JSON array, even when there is only one item.`;
  if (type === "object") return `${fieldName} must be an object. Always return a JSON object, never an explanatory string.`;
  if (type === "number") return `${fieldName} must be a number. Always return a raw number, never text, percent signs, or labels.`;
  if (type === "boolean") return `${fieldName} must be a boolean. Always return true or false.`;
  return `${fieldName} must be a string. Return a plain string only for this field.`;
}

function exampleScalar(type: string, fieldName: string): unknown {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (fieldName === "summary") return "Concise summary.";
  return `Example ${fieldName}`;
}

function exampleFromField(fieldName: string, field: FieldDefinition): unknown {
  if (field.type === "array") {
    const items = field.items as { type?: string; properties?: Record<string, { type?: string }> } | undefined;
    if (items?.properties) {
      return [
        Object.fromEntries(
          Object.entries(items.properties).map(([propertyName, property]) => [
            propertyName,
            exampleScalar(property?.type ?? "string", propertyName),
          ]),
        ),
      ];
    }
    if (fieldName === "refactor_plan") {
      return [{ step: "Identify a safe refactor step", reason: "Improves maintainability", risk: "Low" }];
    }
    if (fieldName === "weaknesses" || fieldName === "strengths") {
      return [{ title: "Example finding", description: "Concrete finding", evidence: "Evidence from provided input" }];
    }
    return [`Example ${fieldName} item`];
  }
  if (field.type === "object") {
    if (field.properties) {
      return Object.fromEntries(
        Object.entries(field.properties).map(([propertyName, property]) => [
          propertyName,
          exampleScalar((property as { type?: string })?.type ?? "string", propertyName),
        ]),
      );
    }
    return { description: `Example ${fieldName}` };
  }
  return exampleScalar(field.type, fieldName);
}

export function compileSchemaAwarePrompt(input: SchemaAwarePromptCompilerInput): SchemaAwarePromptCompilerOutput {
  logEvent("info", "schema_prompt_compilation_started", {
    semantic_intent: input.semanticIntent,
    template_id: input.templateId,
    strict_json: input.strictJson,
  }, input.trace);

  const structuralContract = Object.fromEntries(
    Object.entries(input.outputFields).map(([fieldName, field]) => [
      fieldName,
      {
        type: field.type,
        description: field.description ?? "",
        empty_value: emptyValueForType(field.type),
        rule: ruleForType(fieldName, field.type),
      },
    ]),
  );
  const validExample = {
    content: Object.fromEntries(
      Object.entries(input.outputFields).map(([fieldName, field]) => [fieldName, exampleFromField(fieldName, field)]),
    ),
  };
  const forbiddenPatterns = [
    ...FORBIDDEN_ROOT_FIELDS.map((field) => `Do not include ${field}`),
    "Do not return arrays as strings",
    "Do not return objects as strings",
    "Do not return numbers as strings",
    "Do not add fields that are not listed in structural_contract",
  ];

  logEvent("info", "structural_contract_generated", {
    template_id: input.templateId,
    fields: Object.keys(structuralContract),
  }, input.trace);
  logEvent("info", "valid_response_example_generated", {
    template_id: input.templateId,
    fields: Object.keys(validExample.content),
  }, input.trace);
  logEvent("info", "forbidden_patterns_registered", {
    template_id: input.templateId,
    forbidden_count: forbiddenPatterns.length,
  }, input.trace);

  const previousErrorBlock = input.previousErrors?.length
    ? `\nPrevious validation errors to fix:\n${input.previousErrors.filter(Boolean).map((error) => `- ${error}`).join("\n")}`
    : "";
  const contextBlock = input.context?.trim() ? `\nAdditional context:\n${input.context.trim()}` : "";
  const codeContextBlock = input.codeContext?.trim() ? `\nCODE_CONTEXT:\n${input.codeContext.trim()}` : "";
  const semanticAnalysisBlock = input.semanticAnalysisContext?.trim() ? `\n${input.semanticAnalysisContext.trim()}` : "";
  const typeRules = Object.values(structuralContract).map((field) => `- ${field.rule}`).join("\n");
  const forbiddenRules = forbiddenPatterns.map((pattern) => `- ${pattern}`).join("\n");
  const estimatedPromptLength = [
    input.sourceRequest,
    contextBlock,
    codeContextBlock,
    semanticAnalysisBlock,
    JSON.stringify(structuralContract),
    JSON.stringify(validExample),
  ].join("\n").length;
  const compactOutputPolicy = input.compactOutputPolicy ?? resolveCompactOutputPolicy({
    semanticIntent: input.semanticIntent,
    codeContext: input.codeContext,
    semanticAnalysisContext: input.semanticAnalysisContext,
    estimatedPromptLength,
    trace: input.trace,
  });
  const compactOutputBlock = compactOutputPolicy.enabled
    ? [
        "\nCOMPACT_OUTPUT_MODE:",
        ...compactOutputPolicy.instructions.map((instruction) => `- ${instruction}`),
        "Limits:",
        JSON.stringify(compactOutputPolicy.limits, null, 2),
      ].join("\n")
    : "";

  const compiledPrompt = [
    "You are a content generator for an internal SPEC compiler.",
    "The runtime owns the structure. You must fill only the fields inside content using exactly the expected JSON types.",
    "Return only JSON.",
    "Root object must contain only content.",
    "Do not use markdown.",
    "Do not include explanations.",
    "Do not add fields outside content.",
    "",
    `semantic_intent: ${input.semanticIntent}`,
    `template_id: ${input.templateId}`,
    `strict_json: ${input.strictJson}`,
    "",
    "Source request:",
    input.sourceRequest,
    contextBlock,
    codeContextBlock,
    semanticAnalysisBlock,
    compactOutputBlock,
    previousErrorBlock,
    "",
    "Input fields selected by the system:",
    JSON.stringify(input.inputFields, null, 2),
    "",
    "structural_contract:",
    JSON.stringify(structuralContract, null, 2),
    "",
    "Type rules:",
    typeRules,
    "",
    "Forbidden patterns:",
    forbiddenRules,
    "",
    "Valid content-only response example:",
    JSON.stringify(validExample, null, 2),
    "",
    "If there is not enough information, return structurally valid empty values according to each expected field type.",
    "Return exactly one JSON object with this shape: {\"content\":{...}}",
  ].filter((part) => part !== "").join("\n");

  logEvent("info", "schema_prompt_compiled", {
    template_id: input.templateId,
    semantic_intent: input.semanticIntent,
    prompt_length: compiledPrompt.length,
  }, input.trace);

  return {
    compiledPrompt,
    structuralContract,
    validExample,
    forbiddenPatterns,
  };
}
