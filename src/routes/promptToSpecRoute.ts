import { randomUUID } from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { promptRequestSchema, promptResponseSchema } from "../schemas/promptSpec.js";
import { promptToSpec, validateSpec, improveSpec, calculateQuality } from "../services/promptSpecService.js";
import { logEvent } from "../observability/logger.js";
import { incrementMetric } from "../observability/metrics.js";
import { classifyPromptDetailed } from "../ai/router/semanticClassifier.js";
import { SemanticGovernanceError, validateContextualInputs } from "../spec/governance/semanticGovernance.js";
import { hydrateInlineCodeBeforeRuntimeGate } from "../spec/governance/runtimeInputHydration.js";
import { buildPromptSpecResponse } from "../spec/response/promptSpecResponseBuilder.js";

const cache = new Map<string, any>();
const history = new Map<string, Array<{ quality_score: number; feedback_score: number | null; timestamp: number }>>();
const userRateLimits = new Map<string, number[]>();

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

export function registerPromptToSpecRoute(app: Express) {
  app.post("/prompt-to-spec", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestBody = promptRequestSchema.parse(req.body);
      const {
        prompt,
        context,
        inputs = {},
        strict_mode = false,
        min_quality_score = 0,
        use_cache = false,
        preferred_backend = "auto",
        strict_json = true,
        feedback_score = null,
        user_id,
        team_id = null,
      } = requestBody;
  
      const requestId = randomUUID();
      const requestTimestamp = new Date().toISOString();
      const cacheKey = getCacheKey(prompt, context, user_id, team_id);
      const isBackendHealthProbe = user_id === "health_check" && prompt.trim().toLowerCase() === "backend health check";
      if (isBackendHealthProbe) {
        res.status(200).json(promptResponseSchema.parse({
          prompt_spec: {
            task_instruction: "Backend health check",
            input_fields: {
              request: {
                type: "string",
                description: "Health check request",
              },
            },
            output_fields: {
              status: {
                type: "string",
                description: "Backend health status",
              },
            },
          },
          quality_score: 9,
          validation: {
            is_valid: true,
            issues: [],
            fixes_applied: [],
          },
          iterations: 1,
          performance: {
            execution_time_ms: 0,
            tokens_used: 0,
            model_used: "health-check",
          },
          json_validation: {
            is_valid: true,
            attempts: 1,
            auto_fixed: false,
          },
          ai_backend: {
            provider: "deterministic_builder",
            model: "health-check",
            fallback_used: false,
          },
          fallback: {
            used_fallback: false,
            fallback_type: "none",
            fallback_quality: "none",
          },
          cache: {
            hit: false,
            cache_key: cacheKey,
          },
          versioning: {
            version_id: requestId,
            previous_version_id: null,
            created_at: requestTimestamp,
          },
          ranking: {
            score: 9,
            position: 0,
          },
          learning: {
            feedback_score: null,
            historical_average_score: 0,
            improvement_trend: "stable",
            recommendations: [],
          },
          governance: {
            rate_limited: false,
            quota_remaining: 10,
            request_allowed: true,
          },
          audit: {
            request_id: requestId,
            timestamp: requestTimestamp,
            user_id,
            team_id,
          },
          status: "success",
        }));
        return;
      }
  
      const preflightClassification = classifyPromptDetailed(prompt);
      const hydratedInputs = hydrateInlineCodeBeforeRuntimeGate({
        sourceRequest: prompt,
        semanticIntent: preflightClassification.semantic_intent,
        inputs,
      });
      logEvent("info", "state_machine_transition", {
        from: "classification_layer",
        to: "classified",
        intent: preflightClassification.semantic_intent,
      });
      try {
        validateContextualInputs(preflightClassification.semantic_intent, hydratedInputs.inputs);
      } catch (error) {
        if (error instanceof SemanticGovernanceError) {
          incrementMetric("runtime_blocks_total");
          incrementMetric("provider_false_penalty_prevented_total");
          incrementMetric("retry_prevented_total");
          logEvent("warn", "runtime_input_gate_blocked", {
            intent: error.intent,
            error_code: error.errorCode,
            required_fields: error.requiredFields,
          });
          logEvent("info", "provider_reliability_unchanged_due_to_user_error", {
            error_type: error.errorCode,
            intent: error.intent,
          });
          logEvent("info", "retry_blocked_by_governance", {
            error_type: error.errorCode,
            reason: "deterministic_user_error",
          });
          logEvent("info", "state_machine_transition", {
            from: "classified",
            to: "blocked_by_runtime_gate",
            reason: error.errorCode,
          });
          res.status(422).json({
            status: "error",
            error_code: error.errorCode,
            message: error.message,
            intent: error.intent,
            required_fields: error.requiredFields,
          });
          return;
        }
        throw error;
      }
      logEvent("info", "state_machine_transition", {
        from: "classified",
        to: "llm_invoked",
        reason: "inputs_valid",
        intent: preflightClassification.semantic_intent,
      });
  
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
      const effectiveStrictJson = true;
      const initialResult = await promptToSpec(prompt, context, preferred_backend, effectiveStrictJson);
      let totalTokens = initialResult.tokens;
      let modelUsed = initialResult.model;
      let currentSpec = initialResult.spec;
      let currentAiBackend = initialResult.ai_backend;
      let currentJsonValidation = initialResult.json_validation;
      let currentConfidence = initialResult.confidence;
      let currentClassificationTrace = initialResult.classification_trace;
      let currentQualityBreakdown = initialResult.quality_breakdown;
      let currentFallbackInfo = initialResult.fallback_info;
      let currentProviderState = initialResult.provider_state;
      let currentModelFailoverTrace = initialResult.model_failover_trace;
      let currentCandidateBackends = initialResult.candidate_backends;
      let currentClassificationDecision = initialResult.classification_decision;
  
      let validationResult = validateSpec(currentSpec);
      let iterations = 1;
      let fixesApplied: string[] = [];
      let qualityScore = calculateQuality(validationResult.valid, iterations);
  
      const maxAttempts = strict_mode ? 5 : 3;
      while ((strict_mode ? (!validationResult.valid || qualityScore < min_quality_score) : !validationResult.valid) && iterations < maxAttempts) {
        const issues = validationResult.issues.length
          ? validationResult.issues
          : [`Quality below required threshold: ${min_quality_score}`];
  
        const improved = await improveSpec(currentSpec, issues, context, preferred_backend, effectiveStrictJson);
        currentSpec = improved.prompt_spec;
        fixesApplied = issues.map((issue) => `Attempted fix for: ${issue}`);
        validationResult = validateSpec(currentSpec);
        totalTokens += improved.tokens;
        modelUsed = improved.model;
        currentAiBackend = improved.ai_backend;
        currentJsonValidation = improved.json_validation;
        currentConfidence = initialResult.confidence;
        currentClassificationTrace = initialResult.classification_trace;
        currentQualityBreakdown = initialResult.quality_breakdown;
        currentFallbackInfo = initialResult.fallback_info;
        currentProviderState = initialResult.provider_state;
        currentModelFailoverTrace = initialResult.model_failover_trace;
        currentCandidateBackends = initialResult.candidate_backends;
        currentClassificationDecision = initialResult.classification_decision;
        iterations += 1;
        qualityScore = calculateQuality(validationResult.valid, iterations);
      }
  
      const executionTimeMs = Date.now() - startTime;
      if (currentAiBackend.fallback_used && currentQualityBreakdown?.provider_execution_quality === 0) {
        qualityScore = Math.min(qualityScore, currentFallbackInfo?.fallback_type === "generic" ? 6 : 8);
      }
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
  
      const response = buildPromptSpecResponse({
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
        confidence: currentConfidence,
        quality_breakdown: currentQualityBreakdown,
        classification_trace: currentClassificationTrace,
        classification_decision: currentClassificationDecision,
        provider_state: currentProviderState,
        model_failover_trace: currentModelFailoverTrace,
        candidate_backends: currentCandidateBackends,
        fallback: {
          used_fallback: currentAiBackend.fallback_used,
          fallback_type: currentFallbackInfo?.fallback_type ?? (currentAiBackend.fallback_used ? "generic" : "none"),
          fallback_quality: currentAiBackend.fallback_used
            ? currentFallbackInfo?.fallback_type === "intent_specific" ? "intent-aware" : "degraded"
            : "none",
          fallback_reason: currentFallbackInfo?.fallback_reason,
          original_intent: currentFallbackInfo?.original_intent,
          selected_fallback_template: currentFallbackInfo?.selected_fallback_template,
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
      });
  
      const updatedHistory = [...previousHistory, { quality_score: qualityScore, feedback_score, timestamp: Date.now() }];
      history.set(cacheKey, updatedHistory);
      cache.set(cacheKey, response);
      res.status(200).json(promptResponseSchema.parse(response));
    } catch (error) {
      next(error);
    }
  });
}
