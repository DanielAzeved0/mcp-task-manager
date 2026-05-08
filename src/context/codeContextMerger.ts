import type { WorkspaceFile } from "./dependencyScanner.js";
import type { InlineCodeFile } from "./inlineCodeExtractor.js";

export function mergeCodeContextFiles(inlineFiles: InlineCodeFile[], workspaceFiles: WorkspaceFile[]): WorkspaceFile[] {
  const inlinePaths = new Set(inlineFiles.map((file) => file.path));
  return [
    ...inlineFiles,
    ...workspaceFiles.filter((file) => !inlinePaths.has(file.path)),
  ];
}
