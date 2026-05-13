import ts from "typescript";
import { logEvent, type TraceContext } from "../observability/logger.js";
import type { WorkspaceFile } from "../context/dependencyScanner.js";
import { calculateCodeMetrics, mergeCodeMetrics, type CodeMetrics } from "./codeMetrics.js";
import { detectCodeSmells, recommendationSignalsForSmells, type CodeSmell } from "./codeSmellDetector.js";

interface FunctionSymbol {
  name: string;
  params: Array<{ name: string; type: string }>;
  return_type: string;
  file: string;
}

interface NamedSymbol {
  name: string;
  file: string;
}

export interface AstSemanticAnalysis {
  files_analyzed: number;
  symbols: {
    functions: FunctionSymbol[];
    classes: NamedSymbol[];
    interfaces: NamedSymbol[];
    imports: Array<{ module: string; file: string }>;
    exports: Array<{ name: string; file: string }>;
  };
  metrics: CodeMetrics;
  smells: CodeSmell[];
  recommendation_signals: string[];
}

const ANALYZABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function extension(path: string): string {
  const match = path.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function scriptKindForPath(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function nodeNameText(name: ts.PropertyName | ts.BindingName | undefined): string {
  if (!name) return "anonymous";
  if (ts.isIdentifier(name)) return name.text;
  return name.getText();
}

function typeText(node: ts.Node | undefined): string {
  return node ? node.getText() : "inferred";
}

function extractSymbols(sourceFile: ts.SourceFile, filePath: string): AstSemanticAnalysis["symbols"] {
  const symbols: AstSemanticAnalysis["symbols"] = {
    functions: [],
    classes: [],
    interfaces: [],
    imports: [],
    exports: [],
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      symbols.functions.push({
        name: nodeNameText((node as ts.FunctionDeclaration | ts.MethodDeclaration | ts.FunctionExpression).name),
        params: node.parameters.map((param) => ({
          name: nodeNameText(param.name),
          type: typeText(param.type),
        })),
        return_type: typeText(node.type),
        file: filePath,
      });
    }

    if (ts.isClassDeclaration(node)) {
      symbols.classes.push({ name: nodeNameText(node.name), file: filePath });
    }

    if (ts.isInterfaceDeclaration(node)) {
      symbols.interfaces.push({ name: node.name.text, file: filePath });
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      symbols.imports.push({ module: node.moduleSpecifier.text, file: filePath });
    }

    if (ts.isExportDeclaration(node)) {
      symbols.exports.push({ name: node.getText().slice(0, 80), file: filePath });
    }

    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      symbols.exports.push({ name: nodeNameText(node.name), file: filePath });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return symbols;
}

function mergeSymbols(allSymbols: AstSemanticAnalysis["symbols"][]): AstSemanticAnalysis["symbols"] {
  return allSymbols.reduce<AstSemanticAnalysis["symbols"]>((merged, current) => ({
    functions: [...merged.functions, ...current.functions],
    classes: [...merged.classes, ...current.classes],
    interfaces: [...merged.interfaces, ...current.interfaces],
    imports: [...merged.imports, ...current.imports],
    exports: [...merged.exports, ...current.exports],
  }), {
    functions: [],
    classes: [],
    interfaces: [],
    imports: [],
    exports: [],
  });
}

export function analyzeAst(files: WorkspaceFile[], trace?: TraceContext): AstSemanticAnalysis {
  logEvent("info", "ast_analysis_started", { file_count: files.length }, trace);

  const analyzableFiles = files.filter((file) => ANALYZABLE_EXTENSIONS.has(extension(file.path)));
  const metricsByFile: CodeMetrics[] = [];
  const symbolsByFile: AstSemanticAnalysis["symbols"][] = [];
  const smells: CodeSmell[] = [];

  for (const file of analyzableFiles) {
    const sourceFile = ts.createSourceFile(
      file.path,
      file.content ?? "",
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(file.path),
    );
    const metrics = calculateCodeMetrics(sourceFile);
    const fileSymbols = extractSymbols(sourceFile, file.path);
    const fileSmells = detectCodeSmells(sourceFile, metrics, file.path);

    metricsByFile.push(metrics);
    symbolsByFile.push(fileSymbols);
    smells.push(...fileSmells);

    logEvent("info", "ast_file_analyzed", {
      path: file.path,
      functions: fileSymbols.functions.length,
      classes: fileSymbols.classes.length,
      interfaces: fileSymbols.interfaces.length,
      smells: fileSmells.length,
    }, trace);
  }

  const metrics = mergeCodeMetrics(metricsByFile);
  const symbols = mergeSymbols(symbolsByFile);
  const recommendationSignals = recommendationSignalsForSmells(smells, metrics);

  logEvent("info", "code_metrics_generated", { ...metrics }, trace);
  logEvent("info", "code_smells_detected", {
    smell_count: smells.length,
    smell_types: [...new Set(smells.map((smell) => smell.type))],
  }, trace);
  logEvent("info", "ast_analysis_completed", {
    files_analyzed: analyzableFiles.length,
    recommendation_signals: recommendationSignals,
  }, trace);

  return {
    files_analyzed: analyzableFiles.length,
    symbols,
    metrics,
    smells,
    recommendation_signals: recommendationSignals,
  };
}

export function buildSemanticAnalysisContext(analysis: AstSemanticAnalysis): string {
  if (analysis.files_analyzed === 0) return "";
  return [
    "AST_SEMANTIC_ANALYSIS",
    JSON.stringify({
      files_analyzed: analysis.files_analyzed,
      detected_symbols: analysis.symbols,
      code_metrics: analysis.metrics,
      code_smells: analysis.smells,
      recommendation_signals: analysis.recommendation_signals,
    }, null, 2),
  ].join("\n");
}
