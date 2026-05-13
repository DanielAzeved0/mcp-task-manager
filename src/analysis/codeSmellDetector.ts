import ts from "typescript";
import type { CodeMetrics } from "./codeMetrics.js";

export interface CodeSmell {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  confidence: number;
  file?: string;
}

const GENERIC_NAMES = new Set(["data", "item", "result", "resultado", "temp", "tmp", "obj", "value", "valor"]);

function identifierText(name: ts.PropertyName | ts.BindingName | undefined): string | null {
  if (!name) return null;
  if (ts.isIdentifier(name)) return name.text;
  return null;
}

export function detectCodeSmells(sourceFile: ts.SourceFile, metrics: CodeMetrics, filePath: string): CodeSmell[] {
  const smells: CodeSmell[] = [];
  const genericVariables = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      const name = identifierText(node.name);
      if (name && GENERIC_NAMES.has(name.toLowerCase())) {
        genericVariables.add(name);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (metrics.any_usage_count > 0) {
    smells.push({
      type: "uses_any",
      severity: "medium",
      message: `Detected ${metrics.any_usage_count} explicit any usage(s).`,
      confidence: 0.95,
      file: filePath,
    });
  }

  if (metrics.max_nested_depth > 1) {
    smells.push({
      type: "nested_conditions",
      severity: metrics.max_nested_depth > 2 ? "high" : "medium",
      message: `Nested control flow depth is ${metrics.max_nested_depth}.`,
      confidence: 0.9,
      file: filePath,
    });
  }

  if (metrics.loop_count > 0) {
    smells.push({
      type: "imperative_loops",
      severity: "low",
      message: `Detected ${metrics.loop_count} imperative loop(s).`,
      confidence: 0.75,
      file: filePath,
    });
  }

  for (const variable of genericVariables) {
    smells.push({
      type: "generic_variable_name",
      severity: "low",
      message: `Variable '${variable}' could be more descriptive.`,
      confidence: 0.8,
      file: filePath,
    });
  }

  return smells;
}

export function recommendationSignalsForSmells(smells: CodeSmell[], metrics: CodeMetrics): string[] {
  const signals = new Set<string>();
  if (smells.some((smell) => smell.type === "uses_any")) signals.add("add_explicit_types");
  if (smells.some((smell) => smell.type === "generic_variable_name")) signals.add("rename_generic_variables");
  if (smells.some((smell) => smell.type === "nested_conditions")) signals.add("reduce_nested_conditions");
  if (smells.some((smell) => smell.type === "imperative_loops")) signals.add("consider_array_methods_or_extraction");
  if (metrics.function_count > 0) signals.add("preserve_function_signature");
  if (metrics.cyclomatic_complexity > 5) signals.add("split_complex_logic");
  return [...signals];
}
