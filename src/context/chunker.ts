import type { WorkspaceFile } from "./dependencyScanner.js";

export interface ContextChunk {
  id: string;
  path: string;
  text: string;
  start: number;
  end: number;
}

const DEFAULT_CHUNK_SIZE = 1800;
const DEFAULT_OVERLAP = 180;

export function chunkWorkspaceFile(file: WorkspaceFile, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP): ContextChunk[] {
  const content = file.content ?? "";
  const pathPrefix = `path: ${file.path}\n`;
  const chunks: ContextChunk[] = [];

  if (content.length === 0) {
    return [{
      id: `${file.path}:0`,
      path: file.path,
      text: pathPrefix,
      start: 0,
      end: 0,
    }];
  }

  let start = 0;
  while (start < content.length) {
    const end = Math.min(content.length, start + chunkSize);
    chunks.push({
      id: `${file.path}:${start}`,
      path: file.path,
      text: `${pathPrefix}${content.slice(start, end)}`,
      start,
      end,
    });
    if (end === content.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

export function chunkWorkspaceFiles(files: WorkspaceFile[]): ContextChunk[] {
  return files.flatMap((file) => chunkWorkspaceFile(file));
}
