export interface WorkspaceFile {
  path: string;
  content?: string;
}

export type DependencyMap = Record<string, string[]>;

const IMPORT_RE = /(?:import\s+(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|require\()\s*['"]([^'"]+)['"]/g;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function withoutExtension(path: string): string {
  return path.replace(/\.(tsx?|jsx?|json)$/i, "");
}

function resolveRelativeImport(fromPath: string, specifier: string, allPaths: string[]): string | null {
  if (!specifier.startsWith(".")) return null;
  const fromParts = normalizePath(fromPath).split("/");
  fromParts.pop();
  const targetParts = [...fromParts, ...specifier.split("/")];
  const normalized: string[] = [];
  for (const part of targetParts) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  const base = normalized.join("/");
  return allPaths.find((path) => withoutExtension(path) === base || path.startsWith(`${base}/index.`)) ?? null;
}

function relatedByName(path: string, allPaths: string[]): string[] {
  const normalized = normalizePath(path).toLowerCase();
  const parts = normalized.split(/[/.\\_-]+/).filter((part) => part.length >= 3);
  const anchors = parts.filter((part) => !["src", "test", "tests", "controller", "service", "schema", "dto", "index"].includes(part));
  return allPaths.filter((candidate) => {
    if (candidate === path) return false;
    const lower = candidate.toLowerCase();
    return anchors.some((anchor) => lower.includes(anchor));
  });
}

export function scanDependencies(files: WorkspaceFile[]): DependencyMap {
  const allPaths = files.map((file) => normalizePath(file.path));
  const map: DependencyMap = {};

  for (const file of files) {
    const path = normalizePath(file.path);
    const dependencies = new Set<string>();
    const content = file.content ?? "";
    for (const match of content.matchAll(IMPORT_RE)) {
      const resolved = resolveRelativeImport(path, match[1], allPaths);
      if (resolved) dependencies.add(resolved);
    }
    for (const related of relatedByName(path, allPaths)) {
      dependencies.add(related);
    }
    map[path] = [...dependencies];
  }

  return map;
}
