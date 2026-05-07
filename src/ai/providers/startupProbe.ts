import { buildGeminiModelFailoverChain } from "./modelFailover.js";
import { validateProviderModel } from "../../governance/providers/providerRegistry.js";
import { markProviderModelAvailable, updateProviderStateFromError } from "../../governance/providers/providerState.js";

export interface StartupProbeResult {
  provider: "gemini";
  configured_model: string;
  selected_model: string;
  model_failover_trace: string[];
  valid: boolean;
  issues: string[];
}

export function probeGeminiModelAvailability(configuredModel: string): StartupProbeResult {
  const trace: string[] = [];
  for (const model of buildGeminiModelFailoverChain(configuredModel)) {
    const validation = validateProviderModel("gemini", model, ["json_generation", "spec_generation"]);
    trace.push(`${model}:${validation.valid ? "valid" : "invalid"}`);
    if (validation.valid) {
      markProviderModelAvailable("gemini");
      return {
        provider: "gemini",
        configured_model: configuredModel,
        selected_model: validation.resolvedModel ?? model,
        model_failover_trace: trace,
        valid: true,
        issues: [],
      };
    }
    updateProviderStateFromError("gemini", validation.issues.join("; "));
  }

  return {
    provider: "gemini",
    configured_model: configuredModel,
    selected_model: configuredModel,
    model_failover_trace: trace,
    valid: false,
    issues: ["No valid Gemini model found in registry"],
  };
}
