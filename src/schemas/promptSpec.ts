import { z } from "zod";

export const promptRequestSchema = z.object({
  prompt: z.string().trim().min(1, "prompt is required"),
  context: z.string().optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  strict_mode: z.boolean().optional(),
  min_quality_score: z.number().min(0).max(10).optional(),
  use_cache: z.boolean().optional(),
  preferred_backend: z.enum(["llama", "ollama", "gemini", "auto"]).optional(),
  strict_json: z.boolean().optional(),
  feedback_score: z.number().min(0).max(10).optional(),
  user_id: z.string().trim().min(1, "user_id is required"),
  team_id: z.string().optional(),
});

// Flexible field definition that allows nested properties and items for enriched specs
const fieldDefinition = z.object({
  type: z.string(),
  description: z.string(),
  properties: z.record(z.string(), z.any()).optional(),
  items: z.any().optional(),
  enum: z.array(z.any()).optional(),
  required: z.array(z.string()).optional()
}).passthrough();

export const promptSpecSchema = z.object({
  task_instruction: z.string().trim().min(1),
  input_fields: z.record(z.string(), fieldDefinition),
  output_fields: z.record(z.string(), fieldDefinition),
  metadata: z.object({
    normalized_at: z.string(),
    original_field_count: z.object({
      input: z.number(),
      output: z.number()
    }),
    field_name_changes: z.record(z.string(), z.string())
  }).optional()
});

export const promptValidationSchema = z.object({
  is_valid: z.boolean(),
  issues: z.array(z.string()),
  fixes_applied: z.array(z.string()),
});

export const promptPerformanceSchema = z.object({
  execution_time_ms: z.number().min(0),
  tokens_used: z.number().min(0),
  model_used: z.string(),
});

export const promptCacheSchema = z.object({
  hit: z.boolean(),
  cache_key: z.string(),
});

export const promptVersioningSchema = z.object({
  version_id: z.string(),
  previous_version_id: z.string().nullable(),
  created_at: z.string(),
});

export const promptRankingSchema = z.object({
  score: z.number(),
  position: z.number(),
});

export const promptLearningSchema = z.object({
  feedback_score: z.number().min(0).max(10).nullable(),
  historical_average_score: z.number().min(0).max(10),
  improvement_trend: z.string(),
  recommendations: z.array(z.string()),
});

export const promptGovernanceSchema = z.object({
  rate_limited: z.boolean(),
  quota_remaining: z.number().min(0),
  request_allowed: z.boolean(),
});

export const promptAuditSchema = z.object({
  request_id: z.string(),
  timestamp: z.string(),
  user_id: z.string(),
  team_id: z.string().nullable(),
});

export const promptAiBackendSchema = z.object({
  provider: z.string(),
  model: z.string(),
  fallback_used: z.boolean(),
  prompt_type: z.enum(["simple", "medium", "complex", "critical"]).optional(),
  semantic_intent: z.string().optional(),
  risk_level: z.string().optional(),
});

export const promptConfidenceSchema = z.object({
  classification: z.number().min(0).max(10),
  schema_match: z.number().min(0).max(10),
  semantic_alignment: z.number().min(0).max(10),
  ai_stability: z.number().min(0).max(10),
  provider_reliability: z.number().min(0).max(10),
  template_alignment: z.number().min(0).max(10),
  validation_confidence: z.number().min(0).max(10),
});

export const promptQualityBreakdownSchema = z.object({
  structural_quality: z.number().min(0).max(10),
  semantic_precision: z.number().min(0).max(10),
  intent_match: z.number().min(0).max(10),
  template_fit: z.number().min(0).max(10),
  provider_execution_quality: z.number().min(0).max(10),
});

export const promptClassificationTraceSchema = z.object({
  intent_scores: z.record(z.string(), z.number()),
  negative_penalties: z.record(z.string(), z.number()),
  boosts: z.record(z.string(), z.number()),
  final_scores: z.record(z.string(), z.number()),
  prioritization: z.object({
    priority_intent: z.string().optional(),
    domain_weight: z.number().optional(),
    verb_weight: z.number().optional(),
    context_weight: z.number().optional(),
    boosts: z.record(z.string(), z.number()),
    penalties: z.record(z.string(), z.number()),
    reasons: z.array(z.string()),
  }).optional(),
  ambiguity_detected: z.boolean().optional(),
  confidence_gap: z.number().optional(),
  action_intent: z.string().optional(),
  domain: z.string().optional(),
  task: z.string().optional(),
  decision_reason: z.string().optional(),
});

export const promptProviderStateSchema = z.record(z.string(), z.object({
  provider: z.string(),
  auth: z.string(),
  quota: z.string(),
  model: z.string(),
  network: z.string(),
  reliability: z.number(),
  last_error_type: z.string(),
})).optional();

export const promptModelFailoverTraceSchema = z.array(z.object({
  provider: z.string(),
  model: z.string(),
  error_type: z.string().optional(),
  action: z.string(),
})).optional();

export const promptClassificationDecisionSchema = z.object({
  domain: z.string().optional(),
  task: z.string().optional(),
  priority_intent: z.string().optional(),
  prioritization_reasons: z.array(z.string()).optional(),
  ambiguity_detected: z.boolean().optional(),
  confidence_gap: z.number().optional(),
  decision_reason: z.string().optional(),
}).optional();

export const promptComplexityRoutingSchema = z.object({
  score: z.number(),
  level: z.string(),
  selected_backend: z.string(),
  compact_output_required: z.boolean().optional(),
  reasons: z.array(z.string()),
}).optional();

export const promptSemanticContextSchema = z.object({
  enabled: z.boolean(),
  matches: z.array(z.object({
    path: z.string(),
    score: z.number(),
    reason: z.string(),
  })),
}).optional();

export const promptSessionContextSchema = z.object({
  hydrated: z.boolean(),
  source: z.string().optional(),
  selected_context: z.array(z.string()),
}).optional();

export const promptFallbackSchema = z.object({
  used_fallback: z.boolean(),
  fallback_type: z.string(),
  fallback_quality: z.string(),
  fallback_reason: z.string().optional(),
  original_intent: z.string().optional(),
  selected_fallback_template: z.string().optional(),
});

export const promptJsonValidationSchema = z.object({
  is_valid: z.boolean(),
  attempts: z.number().min(1),
  auto_fixed: z.boolean(),
});

export const promptResponseSchema = z.object({
  prompt_spec: promptSpecSchema,
  quality_score: z.number().min(0).max(10),
  validation: promptValidationSchema,
  iterations: z.number().min(1),
  performance: promptPerformanceSchema,
  json_validation: promptJsonValidationSchema,
  ai_backend: promptAiBackendSchema,
  confidence: promptConfidenceSchema.optional(),
  quality_breakdown: promptQualityBreakdownSchema.optional(),
  classification_trace: promptClassificationTraceSchema.optional(),
  classification_decision: promptClassificationDecisionSchema,
  provider_state: promptProviderStateSchema,
  model_failover_trace: promptModelFailoverTraceSchema,
  candidate_backends: z.array(z.string()).optional(),
  complexity_routing: promptComplexityRoutingSchema,
  semantic_context: promptSemanticContextSchema,
  session_context: promptSessionContextSchema,
  fallback: promptFallbackSchema,
  cache: promptCacheSchema,
  versioning: promptVersioningSchema,
  ranking: promptRankingSchema,
  learning: promptLearningSchema,
  governance: promptGovernanceSchema,
  audit: promptAuditSchema,
  status: z.enum(["success", "improved", "cached", "failed", "blocked", "fixed"]),
});

export type PromptSpec = z.infer<typeof promptSpecSchema>;
export type PromptResponse = z.infer<typeof promptResponseSchema>;
