import { chunkWorkspaceFiles } from "./chunker.js";
import type { WorkspaceFile } from "./dependencyScanner.js";
import { InMemoryVectorStore } from "./vectorStore.js";

export interface ContextIndex {
  store: InMemoryVectorStore;
  chunkCount: number;
  fileCount: number;
}

export function buildContextIndex(files: WorkspaceFile[]): ContextIndex {
  const chunks = chunkWorkspaceFiles(files);
  const store = new InMemoryVectorStore();
  store.addMany(chunks);
  return {
    store,
    chunkCount: chunks.length,
    fileCount: files.length,
  };
}
