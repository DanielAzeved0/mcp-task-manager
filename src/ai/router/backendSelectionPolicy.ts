import type { ComplexityRoutingDecision } from "./complexityRouter.js";

export interface BackendSelectionCandidate {
  deterministic?: boolean;
  backend: {
    provider: string;
  };
}

function providerRank(provider: string, decision: ComplexityRoutingDecision): number {
  if (decision.selected_backend === "gemini") {
    if (provider === "gemini") return 0;
    if (provider === "llama") return 1;
    if (provider === "deterministic_builder") return 2;
    return 3;
  }

  if (decision.level === "low") {
    if (decision.selected_backend === "llama") {
      if (provider === "llama") return 0;
      if (provider === "deterministic_builder") return 1;
      return 2;
    }
    if (provider === "deterministic_builder") return 0;
    if (provider === "llama") return 1;
    return 2;
  }

  if (provider === "gemini") return 0;
  if (provider === "llama") return 1;
  if (provider === "deterministic_builder") return 2;
  return 3;
}

export function applyComplexityBackendSelection<T extends BackendSelectionCandidate>(input: {
  candidates: T[];
  decision: ComplexityRoutingDecision;
  preferredBackend: string;
}): T[] {
  if (input.preferredBackend !== "auto") return input.candidates;

  const ordered = [...input.candidates].sort((a, b) => providerRank(a.backend.provider, input.decision) - providerRank(b.backend.provider, input.decision));
  if (input.decision.level === "low" && input.decision.selected_backend === "deterministic_builder") {
    const deterministic = ordered.find((candidate) => candidate.backend.provider === "deterministic_builder");
    return deterministic ? [deterministic] : ordered;
  }

  return ordered;
}
