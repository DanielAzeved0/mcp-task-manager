import type { Express, Request, Response } from "express";
import { ACTIVE_GEMINI_MODEL } from "../services/promptSpecService.js";
import { getMetricsSnapshot } from "../observability/metrics.js";
import { getProviderHealth } from "../governance/providers/providerGovernance.js";
import { GEMINI_DEFAULT_MODEL, validateProviderModel } from "../governance/providers/providerRegistry.js";
import { getAllProviderStates } from "../governance/providers/providerState.js";
import { getActivePort } from "../runtime/serverRuntimeState.js";
import { preferredPort } from "../server/serverConfig.js";

export function registerHealthRoutes(app: Express) {
  app.get("/", (req: Request, res: Response) => {
    res.send("🚀 MCP Prompt Spec API is running");
  });
  
  app.get("/health", (req: Request, res: Response) => {
    const geminiModel = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
    const geminiModelValidation = validateProviderModel("gemini", geminiModel, ["json_generation", "spec_generation"]);
    res.json({
      status: "ok",
      uptime: process.uptime(),
      provider_state: getAllProviderStates(),
      active_models: {
        gemini: ACTIVE_GEMINI_MODEL,
      },
      providers: {
        gemini: {
          configured: Boolean(process.env.GEMINI_API_KEY),
          model: ACTIVE_GEMINI_MODEL || geminiModelValidation.resolvedModel || geminiModel,
          model_valid: geminiModelValidation.valid,
          issues: geminiModelValidation.issues,
          health: getProviderHealth("gemini"),
        },
        llama: {
          configured: process.env.USE_OLLAMA !== "false",
          model: process.env.OLLAMA_MODEL || "llama3.2",
          health: getProviderHealth("llama"),
        },
      },
    });
  });
  
  app.get("/backend-config", (req: Request, res: Response) => {
    res.json({
      active_port: getActivePort() ?? preferredPort,
      health_endpoint: "/health",
      server_status: getActivePort() ? "running" : "starting",
      connection_status: getActivePort() ? "connected" : "disconnected",
    });
  });
  
  app.get("/metrics", (req: Request, res: Response) => {
    res.json(getMetricsSnapshot());
  });
}
