import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import "dotenv/config";
import { randomUUID } from "crypto";
import net from "net";
import path from "path";
import fs from "fs/promises";
import { promptRequestSchema, promptResponseSchema } from "./schemas/promptSpec.js";
import { promptToSpec, validateSpec, improveSpec, calculateQuality } from "./services/promptSpecService.js";
import { ZodError } from "zod";

console.log("Starting MCP Prompt Spec API...");

const app = express();
const preferredPort = Number(process.env.PORT) || Number(process.env.PREFERRED_PORT) || 3000;
const fallbackPorts = process.env.FALLBACK_PORTS
  ? process.env.FALLBACK_PORTS.split(",").map((port) => Number(port.trim())).filter(Boolean)
  : [];
let activePort: number | null = null;
const backendConfigPath = path.resolve(process.cwd(), "public", "backend-config.json");

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once("error", (err: NodeJS.ErrnoException) => {
        server.close(() => resolve(false));
      })
      .once("listening", () => {
        server.close(() => resolve(true));
      })
      .listen(port, "0.0.0.0");
  });
}

async function findAvailablePort(startPort: number, fallbackList: number[]) {
  const attempts: number[] = [];
  const errors: string[] = [];
  const triedPorts = new Set<number>();
  const maxScan = 1000;
  const candidates = [startPort, ...fallbackList.filter((port) => port !== startPort)];

  for (let offset = 1; offset <= maxScan; offset += 1) {
    candidates.push(startPort + offset);
  }

  for (const candidate of candidates) {
    if (triedPorts.has(candidate)) continue;
    triedPorts.add(candidate);
    attempts.push(candidate);
    console.log(`Checking port ${candidate} for availability...`);

    try {
      const available = await isPortAvailable(candidate);
      if (available) {
        console.log(`Selected available port ${candidate}`);
        return { selectedPort: candidate, attempts, errors };
      }
      errors.push(`Port ${candidate} unavailable`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Port ${candidate} check failed: ${message}`);
    }
  }

  throw new Error(`No available ports found. Tried: ${attempts.join(", ")}`);
}

interface BackendConfigFile {
  active_port: number;
  health_endpoint: string;
  server_status: string;
  connection_status: string;
  port_attempts: number[];
  selected_port: number;
  startup_errors: string[];
}

async function writeBackendConfig(config: BackendConfigFile) {
  try {
    await fs.writeFile(backendConfigPath, JSON.stringify(config, null, 2), "utf-8");
    console.log(`Backend config written to ${backendConfigPath}`);
  } catch (error) {
    console.warn("Unable to write backend config file:", error);
  }
}

async function startServer() {
  const startup = {
    port_attempts: [] as number[],
    selected_port: null as number | null,
    startup_errors: [] as string[],
  };

  try {
    const { selectedPort, attempts, errors } = await findAvailablePort(preferredPort, fallbackPorts);
    startup.port_attempts = attempts;
    startup.selected_port = selectedPort;
    startup.startup_errors = errors;
    activePort = selectedPort;

    await writeBackendConfig({
      active_port: selectedPort,
      health_endpoint: "/health",
      server_status: "running",
      connection_status: "connected",
      port_attempts: attempts,
      selected_port: selectedPort,
      startup_errors: errors,
    });

    app.listen(selectedPort, () => {
      console.log(`Prompt Spec API listening on http://localhost:${selectedPort}`);
      console.log(JSON.stringify({
        port_attempts: startup.port_attempts,
        selected_port: startup.selected_port,
        startup_errors: startup.startup_errors,
      }));
    });
  } catch (error) {
    startup.startup_errors.push(error instanceof Error ? error.message : String(error));
    console.error("Failed to start backend:", startup.startup_errors);
    process.exit(1);
  }
}

const cache = new Map<string, any>();
const history = new Map<string, Array<{ quality_score: number; feedback_score: number | null; timestamp: number }>>();
const userRateLimits = new Map<string, number[]>();

app.use(cors());
app.use(express.json());

function getCacheKey(prompt: string, context: string | undefined, userId: string, teamId: string | null): string {
  return `${userId}::${teamId ?? "anonymous"}::${prompt.trim()}::${context?.trim() ?? ""}`;
}

function calculateImprovementTrend(entries: Array<{ quality_score: number; timestamp: number }>): string {
  if (entries.length < 2) return "stable";
  const first = entries[0].quality_score;
  const last = entries[entries.length - 1].quality_score;
  if (last > first) return "upward";
  if (last < first) return "downward";
  return "stable";
}

app.post("/prompt-to-spec", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestBody = promptRequestSchema.parse(req.body);
    const {
      prompt,
      context,
      strict_mode = false,
      min_quality_score = 0,
      use_cache = false,
      preferred_backend = "auto",
      strict_json = false,
      feedback_score = null,
      user_id,
      team_id = null,
    } = requestBody;

    const requestId = randomUUID();
    const requestTimestamp = new Date().toISOString();
    const cacheKey = getCacheKey(prompt, context, user_id, team_id);

    const rateLimitWindowMs = 60_000;
    const rateLimitMaxRequests = 10;
    const now = Date.now();
    const userRequests = userRateLimits.get(user_id) ?? [];
    const activeRequests = userRequests.filter((timestamp) => now - timestamp < rateLimitWindowMs);
    const rateLimited = activeRequests.length >= rateLimitMaxRequests;
    const requestAllowed = !rateLimited;
    const quotaRemaining = Math.max(0, rateLimitMaxRequests - activeRequests.length - 1);

    userRateLimits.set(user_id, [...activeRequests, now]);

    if (!requestAllowed) {
      const blockedResponse = {
        prompt_spec: {
          task_instruction: "Request blocked due to rate limiting",
          input_fields: {},
          output_fields: {},
        },
        quality_score: 0,
        validation: {
          is_valid: false,
          issues: ["Rate limit exceeded"],
          fixes_applied: [],
        },
        iterations: 0,
        performance: {
          execution_time_ms: 0,
          tokens_used: 0,
          model_used: "",
        },
        cache: {
          hit: false,
          cache_key: cacheKey,
        },
        fallback: {
          used_fallback: false,
          fallback_type: "none",
          fallback_quality: "none",
        },
        governance: {
          rate_limited: true,
          quota_remaining: quotaRemaining,
          request_allowed: false,
        },
        audit: {
          request_id: requestId,
          timestamp: requestTimestamp,
          user_id,
          team_id,
        },
        status: "blocked",
      };

      res.status(429).json(promptResponseSchema.parse(blockedResponse));
      return;
    }

    const previousHistory = history.get(cacheKey) ?? [];
    const historicalAverage = previousHistory.length
      ? previousHistory.reduce((sum, entry) => sum + entry.quality_score, 0) / previousHistory.length
      : 0;
    const position = Array.from(history.values()).flat().length + 1;

    if (use_cache && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      const meetsThreshold = cached.quality_score >= min_quality_score;
      const response = {
        ...cached,
        cache: {
          hit: true,
          cache_key: cacheKey,
        },
        governance: {
          rate_limited: false,
          quota_remaining: quotaRemaining,
          request_allowed: true,
        },
        audit: {
          request_id: requestId,
          timestamp: requestTimestamp,
          user_id,
          team_id,
        },
        status: meetsThreshold ? "cached" : cached.status,
      };

      if (!strict_mode || meetsThreshold) {
        res.status(200).json(promptResponseSchema.parse(response));
        return;
      }
    }

    const startTime = Date.now();
    const initialResult = await promptToSpec(prompt, context, preferred_backend, strict_json);
    let totalTokens = initialResult.tokens;
    let modelUsed = initialResult.model;
    let currentSpec = initialResult.spec;
    let currentAiBackend = initialResult.ai_backend;
    let currentJsonValidation = initialResult.json_validation;

    let validationResult = validateSpec(currentSpec);
    let iterations = 1;
    let fixesApplied: string[] = [];
    let qualityScore = calculateQuality(validationResult.valid, iterations);

    const maxAttempts = strict_mode ? 5 : 3;
    while ((strict_mode ? (!validationResult.valid || qualityScore < min_quality_score) : !validationResult.valid) && iterations < maxAttempts) {
      const issues = validationResult.issues.length
        ? validationResult.issues
        : [`Quality below required threshold: ${min_quality_score}`];

      const improved = await improveSpec(currentSpec, issues, context, preferred_backend, strict_json);
      currentSpec = improved.prompt_spec;
      fixesApplied = issues.map((issue) => `Attempted fix for: ${issue}`);
      validationResult = validateSpec(currentSpec);
      totalTokens += improved.tokens;
      modelUsed = improved.model;
      currentAiBackend = improved.ai_backend;
      currentJsonValidation = improved.json_validation;
      iterations += 1;
      qualityScore = calculateQuality(validationResult.valid, iterations);
    }

    const executionTimeMs = Date.now() - startTime;
    const meetsThreshold = qualityScore >= min_quality_score;
    const status = validationResult.valid && meetsThreshold
      ? iterations === 1
        ? "success"
        : "improved"
      : "failed";

    const versioning = {
      version_id: requestId,
      previous_version_id: cache.has(cacheKey) ? cache.get(cacheKey).versioning.version_id : null,
      created_at: requestTimestamp,
    };

    const improvementTrend = calculateImprovementTrend([...previousHistory, { quality_score: qualityScore, timestamp: Date.now() }]);
    const learning = {
      feedback_score,
      historical_average_score: historicalAverage,
      improvement_trend: improvementTrend,
      recommendations: [
        validationResult.valid ? "The prompt spec is valid and ready for use." : "Run a review on prompt structure.",
        feedback_score !== null ? "Use feedback to guide future improvements." : "Collect feedback after execution.",
      ],
    };

    const response = {
      prompt_spec: currentSpec,
      quality_score: qualityScore,
      validation: {
        is_valid: validationResult.valid,
        issues: validationResult.issues,
        fixes_applied: fixesApplied,
      },
      iterations,
      performance: {
        execution_time_ms: executionTimeMs,
        tokens_used: totalTokens,
        model_used: modelUsed,
      },
      ai_backend: currentAiBackend,
      fallback: {
        used_fallback: currentAiBackend.fallback_used,
        fallback_type: currentAiBackend.fallback_used ? "mock" : "none",
        fallback_quality: currentAiBackend.fallback_used ? "context-aware" : "none",
      },
      json_validation: currentJsonValidation,
      cache: {
        hit: false,
        cache_key: cacheKey,
      },
      versioning,
      ranking: {
        score: qualityScore + (feedback_score ?? 0),
        position,
      },
      learning,
      governance: {
        rate_limited: false,
        quota_remaining: quotaRemaining,
        request_allowed: true,
      },
      audit: {
        request_id: requestId,
        timestamp: requestTimestamp,
        user_id,
        team_id,
      },
      status,
    };

    const updatedHistory = [...previousHistory, { quality_score: qualityScore, feedback_score, timestamp: Date.now() }];
    history.set(cacheKey, updatedHistory);
    cache.set(cacheKey, response);
    res.status(200).json(promptResponseSchema.parse(response));
  } catch (error) {
    next(error);
  }
});

app.get("/", (req: Request, res: Response) => {
  res.send("🚀 MCP Prompt Spec API is running");
});

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
  });
});

app.get("/backend-config", (req: Request, res: Response) => {
  res.json({
    active_port: activePort ?? preferredPort,
    health_endpoint: "/health",
    server_status: activePort ? "running" : "starting",
    connection_status: activePort ? "connected" : "disconnected",
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found." });
});

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues.map((issue) => issue.message) });
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error.";
  if (message.includes("No AI backend configured") || message.includes("Backend unreachable")) {
    res.status(503).json({ error: message });
    return;
  }

  res.status(500).json({ error: message });
});

startServer();
