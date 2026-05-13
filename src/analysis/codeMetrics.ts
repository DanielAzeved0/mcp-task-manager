import ts from "typescript";

export interface CodeMetrics {
  line_count: number;
  function_count: number;
  class_count: number;
  interface_count: number;
  import_count: number;
  export_count: number;
  cyclomatic_complexity: number;
  max_nested_depth: number;
  loop_count: number;
  conditional_count: number;
  any_usage_count: number;
}

function isLoop(node: ts.Node): boolean {
  return ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node);
}

function isConditional(node: ts.Node): boolean {
  return ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCaseClause(node);
}

function isFunctionLikeDeclaration(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node);
}

export function calculateCodeMetrics(sourceFile: ts.SourceFile): CodeMetrics {
  const metrics: CodeMetrics = {
    line_count: sourceFile.text.split(/\r?\n/).length,
    function_count: 0,
    class_count: 0,
    interface_count: 0,
    import_count: 0,
    export_count: 0,
    cyclomatic_complexity: 1,
    max_nested_depth: 0,
    loop_count: 0,
    conditional_count: 0,
    any_usage_count: 0,
  };

  const visit = (node: ts.Node, nestingDepth: number): void => {
    if (isFunctionLikeDeclaration(node)) metrics.function_count += 1;
    if (ts.isClassDeclaration(node)) metrics.class_count += 1;
    if (ts.isInterfaceDeclaration(node)) metrics.interface_count += 1;
    if (ts.isImportDeclaration(node)) metrics.import_count += 1;
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) metrics.export_count += 1;
    if (node.kind === ts.SyntaxKind.AnyKeyword) metrics.any_usage_count += 1;

    const structuralBranch = isLoop(node) || isConditional(node);
    const nextDepth = structuralBranch ? nestingDepth + 1 : nestingDepth;
    if (structuralBranch) {
      metrics.cyclomatic_complexity += 1;
      metrics.max_nested_depth = Math.max(metrics.max_nested_depth, nextDepth);
    }
    if (isLoop(node)) metrics.loop_count += 1;
    if (isConditional(node)) metrics.conditional_count += 1;

    ts.forEachChild(node, (child) => visit(child, nextDepth));
  };

  visit(sourceFile, 0);
  return metrics;
}

export function mergeCodeMetrics(metrics: CodeMetrics[]): CodeMetrics {
  return metrics.reduce<CodeMetrics>((merged, current) => ({
    line_count: merged.line_count + current.line_count,
    function_count: merged.function_count + current.function_count,
    class_count: merged.class_count + current.class_count,
    interface_count: merged.interface_count + current.interface_count,
    import_count: merged.import_count + current.import_count,
    export_count: merged.export_count + current.export_count,
    cyclomatic_complexity: merged.cyclomatic_complexity + Math.max(0, current.cyclomatic_complexity - 1),
    max_nested_depth: Math.max(merged.max_nested_depth, current.max_nested_depth),
    loop_count: merged.loop_count + current.loop_count,
    conditional_count: merged.conditional_count + current.conditional_count,
    any_usage_count: merged.any_usage_count + current.any_usage_count,
  }), {
    line_count: 0,
    function_count: 0,
    class_count: 0,
    interface_count: 0,
    import_count: 0,
    export_count: 0,
    cyclomatic_complexity: metrics.length > 0 ? 1 : 0,
    max_nested_depth: 0,
    loop_count: 0,
    conditional_count: 0,
    any_usage_count: 0,
  });
}
