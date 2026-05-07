import { execSync } from 'child_process';
import { geminiClient, ollamaClient } from "../utils/geminiClient.js";
import { classifyPromptDetailed, type ClassificationResult, type PromptComplexity } from "../utils/promptClassifier.js";
import { promptSpecSchema, PromptSpec } from "../schemas/promptSpec.js";
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildSpecFromTemplate } from "../spec/builder/specBuilder.js";
import { calculateConfidence, calculateQualityBreakdown, type ConfidenceReport, type QualityBreakdown } from "../spec/confidence/confidenceEngine.js";
import { isCanonicalField, validateSchemaCompatibility } from "../spec/contracts/canonicalFields.js";
import { createDeterministicPlan, parsePlanDocument } from "../spec/planner/planDocument.js";
import { selectTemplate } from "../spec/templates/registry.js";
import { resolveTemplateComposition } from "../spec/templates/composition.js";
import { resolveSafeFallbackTemplate, type SafeFallbackResolution, type FallbackReason } from "../spec/templates/safeFallbackResolver.js";
import { SemanticCache } from "../cache/semantic/semanticCache.js";
import { createTraceContext, logEvent } from "../observability/logger.js";
import { incrementMetric, observeMetric } from "../observability/metrics.js";
import { resolveExecutionPolicy, riskAllowsProvider, type ExecutionPolicy } from "../governance/policies/policyEngine.js";
import { getProviderHealth, recordProviderFailure, recordProviderResult } from "../governance/providers/providerGovernance.js";
import { GEMINI_DEFAULT_MODEL, validateProviderHealth, validateProviderModel } from "../governance/providers/providerRegistry.js";
import { classifyProviderError, type ProviderErrorClassification } from "../governance/providers/providerErrorTaxonomy.js";
import { getAllProviderStates, getProviderState, markProviderModelAvailable, updateProviderStateFromError, type ProviderCapabilityState } from "../governance/providers/providerState.js";
import { buildGeminiModelFailoverChain, shouldTryNextGeminiModel, type ModelFailoverEvent } from "../ai/providers/modelFailover.js";
import { probeGeminiModelAvailability } from "../ai/providers/startupProbe.js";
import { resolveUserOverride } from "../governance/providers/userOverrideResolver.js";
import { validateSpecSafety } from "../governance/safety/safetyEngine.js";
import { enforceLearningBoundaries } from "../spec/learning/learningBoundaryEngine.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const MAX_GENERATION_ATTEMPTS = 2;
const PROVIDER_EXECUTION_POLICIES = {
  llama: {
    timeoutMs: Number(process.env.LLAMA_TIMEOUT_MS) || 12000,
    maxRetries: 1,
  },
  gemini: {
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 25000,
    maxRetries: 2,
  },
};
const HISTORY_FILE = join(process.cwd(), 'promptSpecHistory.json');
const semanticSpecCache = new SemanticCache<NormalizedSpec>();
const startupGeminiValidation = probeGeminiModelAvailability(GEMINI_MODEL);
export const ACTIVE_GEMINI_MODEL = startupGeminiValidation.selected_model;
if (!startupGeminiValidation.valid) {
  logEvent("error", "provider_model_invalid", { provider: "gemini", model: GEMINI_MODEL, issues: startupGeminiValidation.issues, phase: "startup", model_failover_trace: startupGeminiValidation.model_failover_trace });
} else {
  logEvent("info", "provider_model_validated", { provider: "gemini", model: ACTIVE_GEMINI_MODEL, phase: "startup", model_failover_trace: startupGeminiValidation.model_failover_trace });
}

interface SpecHistoryEntry {
  id: string;
  prompt: string;
  generated_spec: PromptSpec;
  quality_score: number;
  feedback_score: number;
  timestamp: string;
  iterations: number;
  backend_used: string;
}

interface LearningPatterns {
  high_quality_input_patterns: Record<string, number>;
  high_quality_output_patterns: Record<string, number>;
  low_quality_patterns: string[];
  domain_keywords: Record<string, string[]>;
}

let specHistory: SpecHistoryEntry[] = [];
let learningPatterns: LearningPatterns = {
  high_quality_input_patterns: {},
  high_quality_output_patterns: {},
  low_quality_patterns: [],
  domain_keywords: {}
};

function loadHistory(): void {
  try {
    if (existsSync(HISTORY_FILE)) {
      const data = readFileSync(HISTORY_FILE, 'utf8');
      specHistory = JSON.parse(data);
      analyzePatterns();
    }
  } catch (error) {
    logEvent("warn", "learning_history_load_failed", { reason: error instanceof Error ? error.message : String(error) });
    specHistory = [];
  }
}

function saveHistory(): void {
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(specHistory, null, 2));
  } catch (error) {
    logEvent("warn", "learning_history_save_failed", { reason: error instanceof Error ? error.message : String(error) });
  }
}

function addToHistory(entry: Omit<SpecHistoryEntry, 'id' | 'timestamp'>): void {
  const newEntry: SpecHistoryEntry = {
    ...entry,
    id: Date.now().toString(),
    timestamp: new Date().toISOString()
  };
  specHistory.push(newEntry);

  // Keep only last 1000 entries
  if (specHistory.length > 1000) {
    specHistory = specHistory.slice(-1000);
  }

  saveHistory();
  analyzePatterns();
}

function analyzePatterns(): void {
  const highQualitySpecs = specHistory.filter(entry => entry.quality_score >= 7);
  const lowQualitySpecs = specHistory.filter(entry => entry.quality_score < 5);

  // Reset patterns
  learningPatterns = {
    high_quality_input_patterns: {},
    high_quality_output_patterns: {},
    low_quality_patterns: [],
    domain_keywords: {}
  };

  // Analyze high quality patterns
  highQualitySpecs.forEach(spec => {
    // Input patterns
    Object.keys(spec.generated_spec.input_fields).forEach(field => {
      const type = (spec.generated_spec.input_fields[field] as any)?.type;
      if (type) {
        const key = `${field}:${type}`;
        learningPatterns.high_quality_input_patterns[key] = (learningPatterns.high_quality_input_patterns[key] || 0) + 1;
      }
    });

    // Output patterns
    Object.keys(spec.generated_spec.output_fields).forEach(field => {
      const type = (spec.generated_spec.output_fields[field] as any)?.type;
      if (type) {
        const key = `${field}:${type}`;
        learningPatterns.high_quality_output_patterns[key] = (learningPatterns.high_quality_output_patterns[key] || 0) + 1;
      }
    });

    // Domain keywords
    const words = spec.prompt.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 3) {
        if (!learningPatterns.domain_keywords[word]) {
          learningPatterns.domain_keywords[word] = [];
        }
        Object.keys(spec.generated_spec.input_fields).forEach(field => {
          if (!learningPatterns.domain_keywords[word].includes(field)) {
            learningPatterns.domain_keywords[word].push(field);
          }
        });
      }
    });
  });

  // Analyze low quality patterns
  lowQualitySpecs.forEach(spec => {
    if (Object.keys(spec.generated_spec.input_fields).length === 0) {
      learningPatterns.low_quality_patterns.push('empty_input_fields');
    }
    if (Object.keys(spec.generated_spec.output_fields).length === 0) {
      learningPatterns.low_quality_patterns.push('empty_output_fields');
    }
    if (Object.keys(spec.generated_spec.output_fields).includes('result')) {
      learningPatterns.low_quality_patterns.push('generic_result_output');
    }
  });
}

function improveWithLearning(baseSpec: PromptSpec, prompt: string): { improvedSpec: PromptSpec; improvements: string[] } {
  const improvements: string[] = [];
  let improvedSpec = { ...baseSpec };

  // First: Try domain-aware enrichment
  const domainMatch = detectDomain(prompt);
  if (domainMatch) {
    // Enrich output fields with domain template
    if (Object.keys(improvedSpec.output_fields).length < 2) {
      improvedSpec.output_fields = enrichOutputFieldsWithTemplate(improvedSpec.output_fields, domainMatch.template);
      improvements.push(`Applied domain-specific template: ${domainMatch.domain}`);
    }
  }

  // Apply high-quality input patterns from history
  const promptWords = prompt.toLowerCase().split(/\s+/);
  const relevantKeywords = promptWords.filter(word => learningPatterns.domain_keywords[word]);

  relevantKeywords.forEach(keyword => {
    learningPatterns.domain_keywords[keyword].forEach(field => {
      if (!improvedSpec.input_fields[field]) {
        // Infer field type from patterns
        const patternKey = Object.keys(learningPatterns.high_quality_input_patterns).find(key => key.startsWith(`${field}:`));
        if (patternKey) {
          const type = patternKey.split(':')[1];
          improvedSpec.input_fields[field] = { type, description: `Input field for ${field} based on learned patterns` };
          improvements.push(`Added input field '${field}' from domain keyword '${keyword}'`);
        }
      }
    });
  });

  // Enhance output fields with high-quality patterns
  Object.keys(learningPatterns.high_quality_output_patterns).forEach(pattern => {
    const [field, type] = pattern.split(':');
    if (!improvedSpec.output_fields[field] && learningPatterns.high_quality_output_patterns[pattern] > 2) {
      improvedSpec.output_fields[field] = { type, description: `Structured output field '${field}' based on successful patterns` };
      improvements.push(`Added output field '${field}' from high-quality patterns`);
    }
  });

  // Remove low-quality patterns
  if (learningPatterns.low_quality_patterns.includes('empty_input_fields') && Object.keys(improvedSpec.input_fields).length === 0) {
    improvedSpec.input_fields.user_input = { type: 'string', description: 'Primary user input based on learning' };
    improvements.push('Added default input field to prevent empty input_fields');
  }

  if (learningPatterns.low_quality_patterns.includes('empty_output_fields') && Object.keys(improvedSpec.output_fields).length === 0) {
    // Try domain enrichment for empty outputs
    if (domainMatch) {
      improvedSpec.output_fields = enrichOutputFieldsWithTemplate({}, domainMatch.template);
      improvements.push(`Enriched empty output_fields using domain template: ${domainMatch.domain}`);
    } else {
      improvedSpec.output_fields.response = { 
        type: 'object', 
        description: 'Structured response output',
        properties: {
          data: { type: 'object', description: 'Response data' },
          metadata: { type: 'object', description: 'Response metadata' }
        }
      };
      improvements.push('Added structured default output field to prevent empty output_fields');
    }
  }

  if (learningPatterns.low_quality_patterns.includes('generic_result_output') && improvedSpec.output_fields.result) {
    delete improvedSpec.output_fields.result;
    improvedSpec.output_fields.processed_result = { type: 'object', description: 'Structured processing result' };
    improvements.push('Replaced generic "result" with structured "processed_result"');
  }

  // Enhance task_instruction with context
  if (improvedSpec.task_instruction.length < 20) {
    const enhanced = `Process and handle: ${prompt}. ${improvedSpec.task_instruction}`;
    improvedSpec.task_instruction = enhanced;
    improvements.push('Enhanced task_instruction with more detail and context');
  }

  return { improvedSpec, improvements };
}

// Load history on module load
loadHistory();

export function updateSpecFeedback(specId: string, feedbackScore: number): boolean {
  const entry = specHistory.find(e => e.id === specId);
  if (entry) {
    entry.feedback_score = feedbackScore;
    saveHistory();
    analyzePatterns(); // Re-analyze with new feedback
    return true;
  }
  return false;
}

export function getLearningStats(): { totalSpecs: number; averageQuality: number; topPatterns: Record<string, number> } {
  const total = specHistory.length;
  const averageQuality = total > 0 ? specHistory.reduce((sum, entry) => sum + entry.quality_score, 0) / total : 0;

  // Get top input patterns
  const topInputPatterns: Record<string, number> = {};
  Object.entries(learningPatterns.high_quality_input_patterns)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .forEach(([key, count]) => {
      topInputPatterns[key] = count;
    });

  return {
    totalSpecs: total,
    averageQuality: Math.round(averageQuality * 10) / 10,
    topPatterns: topInputPatterns
  };
}

export { enforceQualityStandards, calculateQualityScore };

// Quality Enforcement System
interface QualityRule {
  check: (spec: PromptSpec) => boolean;
  fix: (spec: PromptSpec, prompt: string) => PromptSpec;
  description: string;
}

interface FieldInferenceRule {
  keywords: string[];
  input_fields: Array<{ name: string; type: string; description: string }>;
  output_fields: Array<{ name: string; type: string; description: string }>;
}

interface OutputTemplate {
  name: string;
  keywords: string[];
  description: string;
  outputSchema: {
    [fieldName: string]: {
      type: string;
      description: string;
      properties?: Record<string, any>;
      items?: Record<string, any>;
      required?: string[];
    };
  };
}

interface DomainPattern {
  domain: string;
  keywords: string[];
  outputTemplates: OutputTemplate[];
}

const FIELD_INFERENCE_RULES: FieldInferenceRule[] = [
  {
    keywords: ['código', 'code', 'program', 'script', 'function'],
    input_fields: [
      { name: 'code_snippet', type: 'string', description: 'The code snippet or program to be processed' },
      { name: 'language', type: 'string', description: 'Programming language of the code' }
    ],
    output_fields: [
      { name: 'analysis', type: 'object', description: 'Detailed analysis of the code' },
      { name: 'issues', type: 'array', description: 'Identified issues or problems' },
      { name: 'suggestions', type: 'array', description: 'Improvement suggestions' }
    ]
  },
  {
    keywords: ['frontend', 'ui', 'component', 'interface', 'react', 'vue', 'angular'],
    input_fields: [
      { name: 'component_name', type: 'string', description: 'Name of the UI component' },
      { name: 'props', type: 'object', description: 'Component properties and configuration' }
    ],
    output_fields: [
      { name: 'ui_structure', type: 'object', description: 'UI component structure and layout' },
      { name: 'styles', type: 'object', description: 'CSS styles and theming' },
      { name: 'behavior', type: 'object', description: 'Component behavior and interactions' }
    ]
  },
  {
    keywords: ['api', 'endpoint', 'request', 'response', 'http', 'rest'],
    input_fields: [
      { name: 'endpoint', type: 'string', description: 'API endpoint URL' },
      { name: 'method', type: 'string', description: 'HTTP method (GET, POST, etc.)' },
      { name: 'payload', type: 'object', description: 'Request payload or parameters' }
    ],
    output_fields: [
      { name: 'response_schema', type: 'object', description: 'Expected response structure' },
      { name: 'status_codes', type: 'object', description: 'Possible HTTP status codes and meanings' }
    ]
  },
  {
    keywords: ['data', 'database', 'query', 'sql', 'table'],
    input_fields: [
      { name: 'data_source', type: 'string', description: 'Source of the data to process' },
      { name: 'query', type: 'string', description: 'Query or operation to perform' }
    ],
    output_fields: [
      { name: 'results', type: 'array', description: 'Query results or processed data' },
      { name: 'metadata', type: 'object', description: 'Metadata about the data operation' }
    ]
  },
  {
    keywords: ['text', 'content', 'write', 'generate', 'nlp'],
    input_fields: [
      { name: 'content', type: 'string', description: 'Text content to process or generate' },
      { name: 'parameters', type: 'object', description: 'Processing parameters and options' }
    ],
    output_fields: [
      { name: 'processed_content', type: 'string', description: 'Processed or generated text content' },
      { name: 'analysis', type: 'object', description: 'Content analysis and insights' }
    ]
  }
];

// COMPREHENSIVE DOMAIN-SPECIFIC OUTPUT ENRICHMENT TEMPLATES
const DOMAIN_PATTERNS: DomainPattern[] = [
  {
    domain: "code_analysis",
    keywords: ["code", "código", "bug", "erro", "analysis", "review", "refactor"],
    outputTemplates: [
      {
        name: "code_issues",
        keywords: ["bug", "issue", "error", "problem"],
        description: "Structured output for code analysis and bug detection",
        outputSchema: {
          issues: {
            type: "array",
            description: "List of identified code issues",
            items: {
              type: "object",
              properties: {
                type: { type: "string", description: "Type of issue (bug, style, performance, security)" },
                severity: { type: "string", enum: ["critical", "high", "medium", "low"], description: "Severity level" },
                line: { type: "number", description: "Line number where issue occurs" },
                column: { type: "number", description: "Column position of the issue" },
                description: { type: "string", description: "Detailed description of the issue" },
                fix: { type: "string", description: "Suggested code fix or remediation" },
                category: { type: "string", description: "Category (logic, performance, security, style)" }
              },
              required: ["type", "severity", "line", "description", "fix"]
            }
          },
          summary: {
            type: "object",
            description: "Summary statistics of code analysis",
            properties: {
              total_issues: { type: "number" },
              critical_count: { type: "number" },
              high_count: { type: "number" },
              medium_count: { type: "number" },
              low_count: { type: "number" },
              quality_score: { type: "number", description: "Overall code quality score (0-100)" }
            }
          },
          recommendations: {
            type: "array",
            description: "High-level recommendations for improvement",
            items: {
              type: "object",
              properties: {
                priority: { type: "string", enum: ["immediate", "important", "nice-to-have"] },
                description: { type: "string" },
                impact: { type: "string", description: "Expected impact (performance, security, maintainability)" }
              }
            }
          }
        }
      }
    ]
  },
  {
    domain: "data_processing",
    keywords: ["data", "database", "query", "sql", "table", "análisis", "analytics"],
    outputTemplates: [
      {
        name: "data_results",
        keywords: ["results", "output", "processed"],
        description: "Structured output for data processing and analytics",
        outputSchema: {
          results: {
            type: "array",
            description: "Array of processed data records",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Unique identifier for the record" },
                data: { type: "object", description: "The actual data record" },
                metrics: { type: "object", description: "Calculated metrics for this record" },
                status: { type: "string", description: "Processing status (success, warning, error)" }
              }
            }
          },
          metadata: {
            type: "object",
            description: "Metadata about the data operation",
            properties: {
              total_records: { type: "number" },
              processed_records: { type: "number" },
              failed_records: { type: "number" },
              execution_time_ms: { type: "number" },
              data_volume_bytes: { type: "number" },
              quality_score: { type: "number" }
            }
          },
          statistics: {
            type: "object",
            description: "Statistical summary of the data",
            properties: {
              count: { type: "number" },
              sum: { type: "number" },
              average: { type: "number" },
              min: { type: "number" },
              max: { type: "number" },
              percentiles: { type: "object" }
            }
          }
        }
      }
    ]
  },
  {
    domain: "api_specification",
    keywords: ["api", "endpoint", "request", "response", "http", "rest", "graphql"],
    outputTemplates: [
      {
        name: "api_specification",
        keywords: ["spec", "specification", "schema"],
        description: "Comprehensive API specification with detailed structures",
        outputSchema: {
          endpoints: {
            type: "array",
            description: "List of API endpoints with full specifications",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "API endpoint path" },
                method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
                description: { type: "string" },
                parameters: {
                  type: "object",
                  description: "Query/path parameters",
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    required: { type: "boolean" },
                    description: { type: "string" }
                  }
                },
                request_body: { type: "object", description: "Request body schema" },
                response_schema: { type: "object", description: "Expected response structure" },
                status_codes: {
                  type: "object",
                  description: "Possible HTTP status codes",
                  properties: {
                    code: { type: "number" },
                    description: { type: "string" }
                  }
                },
                authentication: { type: "string", description: "Auth method required" },
                rate_limit: { type: "string", description: "Rate limiting policy" }
              }
            }
          },
          common_responses: {
            type: "object",
            description: "Common response patterns used across API",
            properties: {
              error_response: { type: "object" },
              success_response: { type: "object" },
              pagination: { type: "object" }
            }
          }
        }
      }
    ]
  },
  {
    domain: "content_generation",
    keywords: ["text", "write", "generate", "content", "article", "document", "nlp"],
    outputTemplates: [
      {
        name: "generated_content",
        keywords: ["generated", "written"],
        description: "Structured output for generated content with metadata",
        outputSchema: {
          content: {
            type: "string",
            description: "The main generated or processed text content"
          },
          sections: {
            type: "array",
            description: "Structured sections within the content",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
                type: { type: "string", enum: ["introduction", "body", "conclusion", "summary"] },
                key_points: { type: "array", items: { type: "string" } }
              }
            }
          },
          analysis: {
            type: "object",
            description: "Content analysis and metrics",
            properties: {
              word_count: { type: "number" },
              readability_score: { type: "number" },
              sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
              key_topics: { type: "array", items: { type: "string" } },
              tone: { type: "string" },
              quality_metrics: { type: "object" }
            }
          },
          metadata: {
            type: "object",
            description: "Generation metadata and parameters",
            properties: {
              model_used: { type: "string" },
              generation_time_ms: { type: "number" },
              temperature: { type: "number" },
              tokens_used: { type: "number" }
            }
          }
        }
      }
    ]
  },
  {
    domain: "ui_component",
    keywords: ["ui", "component", "interface", "react", "vue", "angular", "frontend"],
    outputTemplates: [
      {
        name: "component_specification",
        keywords: ["component", "spec"],
        description: "Complete UI component specification",
        outputSchema: {
          component: {
            type: "object",
            description: "Main component definition",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              type: { type: "string", enum: ["functional", "class", "hook"] },
              props: {
                type: "object",
                description: "Component props definition",
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
                  required: { type: "boolean" },
                  default: { type: "string" },
                  description: { type: "string" }
                }
              },
              state: { type: "object", description: "Internal state definition" },
              events: { type: "array", items: { type: "object" }, description: "Emitted events" }
            }
          },
          structure: {
            type: "object",
            description: "Visual structure and layout",
            properties: {
              layout: { type: "string", description: "Layout type (flex, grid, etc.)" },
              children_slots: { type: "array", items: { type: "object" } },
              responsive_behavior: { type: "object" }
            }
          },
          styling: {
            type: "object",
            description: "CSS and styling specifications",
            properties: {
              colors: { type: "object" },
              typography: { type: "object" },
              spacing: { type: "object" },
              animations: { type: "array", items: { type: "object" } }
            }
          },
          accessibility: {
            type: "object",
            description: "Accessibility features and ARIA roles",
            properties: {
              aria_roles: { type: "array" },
              keyboard_support: { type: "boolean" },
              screen_reader_friendly: { type: "boolean" },
              wcag_level: { type: "string" }
            }
          }
        }
      }
    ]
  }
];

// OUTPUT ENRICHMENT ENGINE
function detectDomain(prompt: string): { domain: string; pattern: DomainPattern; template: OutputTemplate } | null {
  const lowerPrompt = prompt.toLowerCase();
  
  for (const pattern of DOMAIN_PATTERNS) {
    const matchesKeyword = pattern.keywords.some(keyword => lowerPrompt.includes(keyword));
    if (matchesKeyword) {
      for (const template of pattern.outputTemplates) {
        const matchesTemplate = template.keywords.some(keyword => lowerPrompt.includes(keyword));
        if (matchesTemplate) {
          return { domain: pattern.domain, pattern, template };
        }
      }
      // If no template matches, use the first one
      return { domain: pattern.domain, pattern, template: pattern.outputTemplates[0] };
    }
  }
  return null;
}

function enrichOutputFieldsWithTemplate(fields: Record<string, any>, template: OutputTemplate): Record<string, any> {
  const enriched: Record<string, any> = {};

  // Use template schema directly
  Object.entries(template.outputSchema).forEach(([key, schema]) => {
    enriched[key] = {
      type: schema.type,
      description: schema.description,
      ...(schema.properties && { properties: schema.properties }),
      ...(schema.items && { items: schema.items }),
      ...(schema.required && { required: schema.required })
    };
  });

  return enriched;
}

function isGenericOutput(fields: Record<string, any>): boolean {
  const genericPatterns = [
    'result',
    'output',
    'data',
    'response',
    'item',
    'value',
    'object'
  ];
  
  const fieldNames = Object.keys(fields);
  return fieldNames.every(name => genericPatterns.includes(name.toLowerCase()));
}

function detectAntiPatterns(spec: PromptSpec): { detected: string[]; severity: 'critical' | 'high' | 'medium' }[] {
  const issues: { detected: string[]; severity: 'critical' | 'high' | 'medium' }[] = [];

  // Check for empty structures
  if (Object.keys(spec.output_fields).length === 0) {
    issues.push({ detected: ['empty_output_fields'], severity: 'critical' });
  }

  // Check for generic field names
  const outputFieldNames = Object.keys(spec.output_fields);
  const hasGenericFields = outputFieldNames.some(name => 
    ['result', 'output', 'data', 'response'].includes(name.toLowerCase())
  );
  if (hasGenericFields && outputFieldNames.length === 1) {
    issues.push({ detected: ['single_generic_output'], severity: 'critical' });
  }

  // Check if all outputs are simple strings (not structured)
  const allSimpleStrings = Object.values(spec.output_fields).every(field => 
    (field as any).type === 'string' && !(field as any).properties
  );
  if (allSimpleStrings && outputFieldNames.length < 2) {
    issues.push({ detected: ['non_structured_output'], severity: 'high' });
  }

  // Check for missing nested properties in object fields
  Object.entries(spec.output_fields).forEach(([name, field]) => {
    const f = field as any;
    if ((f.type === 'object' || f.type === 'array') && !f.properties && !f.items) {
      issues.push({ detected: [`incomplete_structure_${name}`], severity: 'medium' });
    }
  });

  // Check task instruction
  if (spec.task_instruction.length < 20) {
    issues.push({ detected: ['vague_task_instruction'], severity: 'high' });
  }

  return issues;
}

function autoFixAntiPatterns(spec: PromptSpec, prompt: string): { fixed: PromptSpec; fixes: string[] } {
  let fixed = { ...spec };
  const fixes: string[] = [];
  const antiPatterns = detectAntiPatterns(spec);

  for (const issue of antiPatterns) {
    if (issue.detected.includes('empty_output_fields')) {
      const domainMatch = detectDomain(prompt);
      if (domainMatch) {
        fixed.output_fields = enrichOutputFieldsWithTemplate(fixed.output_fields, domainMatch.template);
        fixes.push(`Enriched empty output_fields using domain template: ${domainMatch.domain}`);
      }
    }

    if (issue.detected.includes('single_generic_output')) {
      const domainMatch = detectDomain(prompt);
      if (domainMatch) {
        fixed.output_fields = enrichOutputFieldsWithTemplate({}, domainMatch.template);
        fixes.push(`Replaced generic output with structured domain template: ${domainMatch.domain}`);
      } else {
        // Fallback: create multiple structured outputs
        fixed.output_fields = {
          structured_result: {
            type: 'object',
            description: 'Structured result with data and metadata',
            properties: {
              data: { type: 'object', description: 'The main data result' },
              metadata: { type: 'object', description: 'Processing metadata' },
              status: { type: 'string', description: 'Operation status' }
            }
          },
          summary: {
            type: 'object',
            description: 'Summary and statistics',
            properties: {
              key_metrics: { type: 'object' },
              processing_info: { type: 'object' }
            }
          }
        };
        fixes.push('Replaced single generic output with multiple structured outputs');
      }
    }

    if (issue.detected.includes('non_structured_output')) {
      const domainMatch = detectDomain(prompt);
      if (domainMatch) {
        fixed.output_fields = enrichOutputFieldsWithTemplate(fixed.output_fields, domainMatch.template);
        fixes.push(`Converted simple outputs to structured domain template: ${domainMatch.domain}`);
      } else {
        // Add structured output alongside simple ones
        const newOutputs = {
          ...fixed.output_fields,
          structured_data: {
            type: 'object',
            description: 'Structured data output with detailed properties',
            properties: {
              content: { type: 'object' },
              metadata: { type: 'object' },
              quality_metrics: { type: 'object' }
            }
          }
        };
        fixed.output_fields = newOutputs;
        fixes.push('Added structured output alongside simple outputs');
      }
    }

    issue.detected.forEach(det => {
      if (det.startsWith('incomplete_structure_')) {
        const fieldName = det.replace('incomplete_structure_', '');
        const field = fixed.output_fields[fieldName] as any;
        if (field.type === 'object' && !field.properties) {
          field.properties = {
            id: { type: 'string' },
            data: { type: 'object' },
            metadata: { type: 'object' }
          };
          fixes.push(`Added nested properties to object field: ${fieldName}`);
        }
        if (field.type === 'array' && !field.items) {
          field.items = {
            type: 'object',
            properties: {
              id: { type: 'string' },
              data: { type: 'object' }
            }
          };
          fixes.push(`Added item schema to array field: ${fieldName}`);
        }
      }
    });

    if (issue.detected.includes('vague_task_instruction')) {
      fixed.task_instruction = `Provide detailed, structured, and actionable outputs for: ${prompt}. ${fixed.task_instruction}`;
      fixes.push('Enhanced task instruction with specificity requirement');
    }
  }

  return { fixed, fixes };
}

const QUALITY_RULES: QualityRule[] = [
  {
    description: 'input_fields must not be empty',
    check: (spec) => Object.keys(spec.input_fields).length > 0,
    fix: (spec, prompt) => {
      if (Object.keys(spec.input_fields).length === 0) {
        const inferredFields = inferFieldsFromPrompt(prompt, 'input');
        return { ...spec, input_fields: inferredFields };
      }
      return spec;
    }
  },
  {
    description: 'output_fields must not be empty',
    check: (spec) => Object.keys(spec.output_fields).length > 0,
    fix: (spec, prompt) => {
      if (Object.keys(spec.output_fields).length === 0) {
        const domainMatch = detectDomain(prompt);
        if (domainMatch) {
          return { ...spec, output_fields: enrichOutputFieldsWithTemplate({}, domainMatch.template) };
        }
        const inferredFields = inferFieldsFromPrompt(prompt, 'output');
        return { ...spec, output_fields: inferredFields };
      }
      return spec;
    }
  },
  {
    description: 'output must contain structured objects or arrays when applicable',
    check: (spec) => {
      const hasStructured = Object.values(spec.output_fields).some(field => {
        const f = field as any;
        return (f.type === 'object' || f.type === 'array') && (f.properties || f.items);
      });
      return hasStructured || Object.keys(spec.output_fields).length === 0;
    },
    fix: (spec, prompt) => {
      const hasStructured = Object.values(spec.output_fields).some(field => {
        const f = field as any;
        return (f.type === 'object' || f.type === 'array') && (f.properties || f.items);
      });

      if (!hasStructured && Object.keys(spec.output_fields).length > 0) {
        const domainMatch = detectDomain(prompt);
        if (domainMatch) {
          return { ...spec, output_fields: enrichOutputFieldsWithTemplate(spec.output_fields, domainMatch.template) };
        }

        // Fallback: convert first string field to structured
        const updated = { ...spec };
        const firstKey = Object.keys(updated.output_fields)[0];
        if (firstKey && (updated.output_fields[firstKey] as any).type === 'string') {
          (updated.output_fields[firstKey] as any).type = 'object';
          (updated.output_fields[firstKey] as any).properties = {
            data: { type: 'object' },
            metadata: { type: 'object' }
          };
        }
        return updated;
      }
      return spec;
    }
  },
  {
    description: 'no single generic field names like "result"',
    check: (spec) => {
      const fields = Object.keys(spec.output_fields);
      const hasGenericOnly = fields.length === 1 && ['result', 'output'].includes(fields[0].toLowerCase());
      return !hasGenericOnly;
    },
    fix: (spec, prompt) => {
      const fields = Object.keys(spec.output_fields);
      const hasGenericOnly = fields.length === 1 && ['result', 'output'].includes(fields[0].toLowerCase());

      if (hasGenericOnly) {
        const domainMatch = detectDomain(prompt);
        if (domainMatch) {
          return { ...spec, output_fields: enrichOutputFieldsWithTemplate({}, domainMatch.template) };
        }

        // Create a more descriptive output structure
        return {
          ...spec,
          output_fields: {
            data: {
              type: 'object',
              description: 'Structured data result with detailed information',
              properties: {
                content: { type: 'object', description: 'Main content' },
                metadata: { type: 'object', description: 'Metadata and context' }
              }
            },
            summary: {
              type: 'object',
              description: 'Summary of the operation with key metrics',
              properties: {
                status: { type: 'string' },
                quality_score: { type: 'number' }
              }
            }
          }
        };
      }
      return spec;
    }
  },
  {
    description: 'task_instruction must be specific and actionable',
    check: (spec) => spec.task_instruction.length > 15 && !spec.task_instruction.toLowerCase().includes('generate something'),
    fix: (spec, prompt) => {
      if (spec.task_instruction.length <= 15 || spec.task_instruction.toLowerCase().includes('generate something')) {
        const enhanced = `Provide detailed, structured, and production-grade outputs for: ${prompt}. ${spec.task_instruction}`;
        return { ...spec, task_instruction: enhanced };
      }
      return spec;
    }
  },
  {
    description: 'output fields should have nested properties defining structure',
    check: (spec) => {
      return Object.values(spec.output_fields).some(field => {
        const f = field as any;
        return f.properties || f.items;
      });
    },
    fix: (spec, prompt) => {
      const domainMatch = detectDomain(prompt);
      if (domainMatch) {
        return { ...spec, output_fields: enrichOutputFieldsWithTemplate(spec.output_fields, domainMatch.template) };
      }

      // Add nested properties to fields that lack them
      const updated = { ...spec };
      Object.entries(updated.output_fields).forEach(([key, field]) => {
        const f = field as any;
        if (!f.properties && !f.items) {
          if (f.type === 'object') {
            f.properties = {
              content: { type: 'object', description: 'Main content' },
              metadata: { type: 'object', description: 'Metadata' }
            };
          } else if (f.type === 'array') {
            f.items = {
              type: 'object',
              properties: {
                id: { type: 'string' },
                data: { type: 'object' }
              }
            };
          }
        }
      });
      return updated;
    }
  }
];

function inferFieldsFromPrompt(prompt: string, fieldType: 'input' | 'output'): Record<string, any> {
  const lowerPrompt = prompt.toLowerCase();
  const inferredFields: Record<string, any> = {};

  for (const rule of FIELD_INFERENCE_RULES) {
    const matchesKeyword = rule.keywords.some(keyword => lowerPrompt.includes(keyword));
    if (matchesKeyword) {
      const fields = fieldType === 'input' ? rule.input_fields : rule.output_fields;
      fields.forEach(field => {
        inferredFields[field.name] = {
          type: field.type,
          description: field.description
        };
      });
      break; // Use first matching rule
    }
  }

  // Fallback if no rules matched
  if (Object.keys(inferredFields).length === 0) {
    if (fieldType === 'input') {
      inferredFields.user_input = {
        type: 'string',
        description: 'Primary user input for processing'
      };
    } else {
      inferredFields.response = {
        type: 'string',
        description: 'Primary response or result'
      };
      inferredFields.details = {
        type: 'object',
        description: 'Detailed structured information'
      };
    }
  }

  return inferredFields;
}

function enforceQualityStandards(spec: PromptSpec, prompt: string): { spec: PromptSpec; qualityScore: number; appliedFixes: string[] } {
  let currentSpec = { ...spec };
  const appliedFixes: string[] = [];
  let qualityScore = 10;

  // First pass: apply anti-pattern fixes
  const { fixed: antiPatternFixed, fixes: antiPatternFixes } = autoFixAntiPatterns(currentSpec, prompt);
  currentSpec = antiPatternFixed;
  appliedFixes.push(...antiPatternFixes);
  qualityScore -= Math.min(antiPatternFixes.length, 2); // Max 2 points for anti-patterns

  // Second pass: apply quality rules
  for (const rule of QUALITY_RULES) {
    if (!rule.check(currentSpec)) {
      logEvent("debug", "quality_rule_applied", { rule: rule.description });
      currentSpec = rule.fix(currentSpec, prompt);
      appliedFixes.push(rule.description);
      qualityScore -= 1; // Deduct point for each rule fix needed
    }
  }

  // Ensure minimum quality
  qualityScore = Math.max(qualityScore, 5);

  return { spec: currentSpec, qualityScore, appliedFixes };
}

function calculateQualityScore(spec: PromptSpec): number {
  let score = 10;

  // Check required rules
  if (Object.keys(spec.input_fields).length === 0) score -= 3;
  if (Object.keys(spec.output_fields).length === 0) score -= 3;
  if (Object.keys(spec.output_fields).includes('result')) score -= 2;
  if (spec.task_instruction.length < 15) score -= 2;

  // Penalty for generic outputs
  const antiPatterns = detectAntiPatterns(spec);
  score -= antiPatterns.filter(p => p.severity === 'critical').length * 2;
  score -= antiPatterns.filter(p => p.severity === 'high').length;

  // Bonus for structured outputs
  const hasStructuredOutput = Object.values(spec.output_fields).some(field => {
    const f = field as any;
    return (f.type === 'object' || f.type === 'array') && (f.properties || f.items);
  });
  if (hasStructuredOutput) score += 2;

  // Bonus for domain-specific fields
  const hasDomainFields = Object.keys(spec.input_fields).some(key => !['user_input', 'input'].includes(key));
  if (hasDomainFields) score += 1;

  // Bonus for detailed nested properties
  let nestedPropertyCount = 0;
  Object.values(spec.output_fields).forEach(field => {
    const f = field as any;
    if (f.properties) {
      nestedPropertyCount += Object.keys(f.properties).length;
    }
  });
  if (nestedPropertyCount >= 5) score += 2;
  else if (nestedPropertyCount >= 3) score += 1;

  return Math.max(0, Math.min(10, score));
}

const SYSTEM_INSTRUCTION = `You are an expert prompt engineering assistant specializing in creating deeply structured, production-grade specifications.

CRITICAL: You MUST return ONLY valid JSON. No text before or after the JSON. No explanations. No markdown.

REQUIRED JSON STRUCTURE:
{
  "task_instruction": "Detailed, specific, actionable instruction that ensures rich, structured outputs",
  "input_fields": {
    "field_name": {
      "type": "string|number|boolean|object|array",
      "description": "Clear description of what this input represents"
    }
  },
  "output_fields": {
    "field_name": {
      "type": "string|number|boolean|object|array",
      "description": "Clear description of the output format"
    }
  }
}

MANDATORY RULES FOR PRODUCTION-GRADE SPECS:
1. input_fields must NOT be empty
2. output_fields must NOT be empty - ensure multiple structured outputs
3. Each field must have "type" and "description"
4. NO generic fields like "result", "output", "data", "item" as single outputs
5. Convert simple string outputs to structured objects with nested properties
6. Include domain-specific properties based on prompt context:
   - For code analysis: type, severity, line, description, fix, category
   - For data processing: id, data, metrics, status
   - For APIs: path, method, parameters, response_schema, status_codes
   - For content: sections, key_points, analysis, metadata
7. task_instruction must be specific, detailed, and actionable
8. When in doubt, provide MULTIPLE structured outputs rather than single generic ones
9. Return ONLY the JSON object, nothing else

QUALITY CHECKLIST:
✓ Output contains array or object types (not just strings)
✓ Objects have meaningful nested properties
✓ Output is domain-relevant and specific
✓ Each field has description explaining content and usage
✓ Structure is immediately actionable in applications`;

const GEMINI_PLANNER_INSTRUCTION = `You are a planning assistant for an AI Specification Operating System.

CRITICAL: You MUST NOT generate full schemas. The system owns schemas and final specification structure.

Return ONLY a JSON object with this PlanDocument shape:
{
  "intent": "string",
  "required_inputs": ["field_name"],
  "required_outputs": ["field_name"],
  "risk_level": "low|medium|high|critical",
  "quality_constraints": ["constraint"],
  "suggested_template": "template_id"
}

Use only one suggested_template from:
security_analysis, frontend_component, api_design, architecture_design, code_refactor,
observability_analysis, database_design, ai_orchestration, testing_strategy,
performance_optimization, general_spec.`;

const IMPROVEMENT_INSTRUCTION = `You are an expert prompt engineering assistant. Transform the following specification into deeply structured, production-grade output.

TRANSFORMATION REQUIREMENTS:
1. Expand generic outputs into rich, multi-field structures
2. Add nested properties with type definitions
3. Include domain-specific fields based on the context
4. Ensure outputs are immediately consumable by applications
5. Add detailed descriptions for each field

REQUIRED OUTPUT FORMAT:
Return ONLY this JSON structure:
{
  "prompt_spec": {
    "task_instruction": "Detailed specific instruction for producing structured outputs",
    "input_fields": {
      "field_name": {
        "type": "string",
        "description": "Clear description"
      }
    },
    "output_fields": {
      "field_name": {
        "type": "string|object|array",
        "description": "Clear description",
        "properties": { /* if object */ },
        "items": { /* if array */ }
      }
    }
  },
  "improvements_applied": "List of structural improvements made"
}

MANDATORY: Return ONLY the JSON object, no explanations or text outside JSON.`;

function getAvailableOllamaModels(): string[] {
  try {
    const output = execSync('ollama list', { encoding: 'utf8', timeout: 3000 });
    // Parse output: skip header, extract first column (NAME)
    const lines = output.trim().split('\n').slice(1);
    return lines.map(line => line.trim().split(/\s+/)[0]).filter(Boolean);
  } catch (error) {
    logEvent("warn", "ollama_models_unavailable", { reason: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

function resolveOllamaModel(configuredModel: string): { resolvedModel: string; status: 'valid' | 'corrected' | 'fallback'; availableModels: string[] } {
  const availableModels = getAvailableOllamaModels();

  if (availableModels.length === 0) {
    throw new Error('No Ollama models installed. Please install models using "ollama pull <model>" and ensure Ollama is running.');
  }

  const normalizedConfigured = configuredModel.toLowerCase().trim();

  // Exact match
  if (availableModels.includes(configuredModel)) {
    logEvent("debug", "ollama_model_validated", { configuredModel, resolvedModel: configuredModel, status: "valid" });
    return { resolvedModel: configuredModel, status: 'valid', availableModels };
  }

  // Partial match (starts with or contains)
  const partialMatch = availableModels.find(model =>
    model.toLowerCase().startsWith(normalizedConfigured) ||
    model.toLowerCase().includes(normalizedConfigured)
  );
  if (partialMatch) {
    logEvent("debug", "ollama_model_validated", { configuredModel, resolvedModel: partialMatch, status: "corrected" });
    return { resolvedModel: partialMatch, status: 'corrected', availableModels };
  }

  // If no tag provided, try appending :latest
  if (!configuredModel.includes(':')) {
    const withLatest = `${configuredModel}:latest`;
    if (availableModels.includes(withLatest)) {
      logEvent("debug", "ollama_model_validated", { configuredModel, resolvedModel: withLatest, status: "corrected" });
      return { resolvedModel: withLatest, status: 'corrected', availableModels };
    }
  }

  // Fallback to first available model
  const fallbackModel = availableModels[0];
  logEvent("warn", "ollama_model_fallback", { configuredModel, resolvedModel: fallbackModel, status: "fallback", availableModels });
  return { resolvedModel: fallbackModel, status: 'fallback', availableModels };
}

function extractJsonObject(rawText: string): string {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Unable to extract JSON object from AI response.");
  }
  return rawText.slice(start, end + 1);
}

function fixJsonString(jsonString: string): string {
  // Remove markdown code blocks if present
  jsonString = jsonString.replace(/```json\s*/g, "").replace(/```\s*$/g, "");

  // Fix common JSON issues
  jsonString = jsonString
    .replace(/,\s*}/g, "}") // Remove trailing commas
    .replace(/,\s*]/g, "]") // Remove trailing commas in arrays
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Quote unquoted keys
    .replace(/:\s*'([^']*)'/g, ':"$1"') // Convert single quotes to double quotes
    .replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([,}\]])/g, ':"$1"$2') // Quote unquoted string values
    .replace(/:\s*(true|false|null)\s*([,}\]])/g, ':$1$2'); // Ensure boolean/null values are not quoted

  return jsonString;
}

function parseJsonWithRetry<T>(rawText: string, strictJson: boolean = false): { parsed: T; attempts: number; autoFixed: boolean } {
  let attempts = 1;
  let autoFixed = false;

  // First attempt: normal parsing
  try {
    const extracted = extractJsonObject(rawText);
    return { parsed: JSON.parse(extracted) as T, attempts: 1, autoFixed: false };
  } catch (error) {
    if (!strictJson) {
      throw error;
    }

    attempts++;

    // Second attempt: try to fix common JSON issues
    try {
      const extracted = extractJsonObject(rawText);
      const fixedJson = fixJsonString(extracted);
      autoFixed = fixedJson !== extracted;
      return { parsed: JSON.parse(fixedJson) as T, attempts: 2, autoFixed };
    } catch (fixError) {
      attempts++;

      // Third attempt: try with the entire raw text
      try {
        const fixedJson = fixJsonString(rawText);
        autoFixed = fixedJson !== rawText;
        return { parsed: JSON.parse(fixedJson) as T, attempts: 3, autoFixed };
      } catch (finalError) {
        throw new Error(`Failed to parse JSON after ${attempts} attempts. Last error: ${(finalError as Error).message}`);
      }
    }
  }
}

function parseJson<T>(rawText: string): T {
  try {
    return JSON.parse(extractJsonObject(rawText)) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${(error as Error).message}`);
  }
}

type CompletionResult = {
  content: string;
  tokens: number;
  model: string;
};

type AiBackend = {
  provider: string;
  model: string;
  fallback_used: boolean;
  prompt_type?: PromptComplexity;
  semantic_intent?: string;
  risk_level?: string;
};

type FallbackInfo = {
  used_fallback: boolean;
  fallback_type: "none" | "intent_specific" | "generic" | "semantic_cache";
  fallback_reason?: FallbackReason;
  original_intent?: string;
  selected_fallback_template?: string;
};

type BackendCandidate = {
  client: any;
  backend: AiBackend;
  deterministic?: boolean;
};

type ProviderRuntimeInfo = {
  provider_state: Record<string, ProviderCapabilityState>;
  model_failover_trace: ModelFailoverEvent[];
  candidate_backends: string[];
  classification_decision?: ClassificationResult["classification_decision"];
};

function createLlamaCandidate(classification: ClassificationResult, fallbackUsed: boolean): BackendCandidate | null {
  if (!ollamaClient) return null;

  const { resolvedModel } = resolveOllamaModel(OLLAMA_MODEL);
  return {
    client: ollamaClient,
    backend: {
      provider: "llama",
      model: resolvedModel,
      fallback_used: fallbackUsed,
      prompt_type: classification.prompt_type,
      semantic_intent: classification.semantic_intent,
      risk_level: classification.risk_level,
    }
  };
}

function createGeminiCandidate(classification: ClassificationResult, fallbackUsed: boolean): BackendCandidate | null {
  if (!geminiClient) return null;
  const health = getProviderHealth("gemini");
  const healthValidation = validateProviderHealth("gemini", health.reliability);
  if (!healthValidation.valid) {
    logEvent("warn", "provider_health_invalid", { provider: "gemini", issues: healthValidation.issues, health });
    return null;
  }
  logEvent("info", "provider_resolution", { provider: "gemini", model: ACTIVE_GEMINI_MODEL, health });

  return {
    client: geminiClient,
    backend: {
      provider: "gemini",
      model: ACTIVE_GEMINI_MODEL,
      fallback_used: fallbackUsed,
      prompt_type: classification.prompt_type,
      semantic_intent: classification.semantic_intent,
      risk_level: classification.risk_level,
    }
  };
}

function selectBackend(preferredBackend: string = "auto", prompt: string = ""): { candidates: BackendCandidate[]; classification: ClassificationResult; policy: ExecutionPolicy } {
  const classification = classifyPromptDetailed(prompt);
  const policy = resolveExecutionPolicy(classification);
  const override = resolveUserOverride(preferredBackend, classification, policy);
  const candidates: BackendCandidate[] = [];

  const addLlama = (fallbackUsed: boolean) => {
    try {
      const candidate = createLlamaCandidate(classification, fallbackUsed);
      if (candidate) candidates.push(candidate);
    } catch (error) {
      logEvent("warn", "backend_unavailable", { backend: "llama", reason: error instanceof Error ? error.message : String(error) });
    }
  };

  const addGemini = (fallbackUsed: boolean) => {
    const candidate = createGeminiCandidate(classification, fallbackUsed);
    if (candidate) candidates.push(candidate);
  };

  const addDeterministic = () => {
    candidates.push({
      client: null,
      deterministic: true,
      backend: {
        provider: "deterministic_builder",
        model: "template-compiler",
        fallback_used: true,
        prompt_type: classification.prompt_type,
        semantic_intent: classification.semantic_intent,
        risk_level: classification.risk_level,
      },
    });
    logEvent("info", "fallback_candidate_added", {
      provider: "deterministic_builder",
      model: "template-compiler",
      intent: classification.semantic_intent,
    });
  };

  if (override.manualOverride) {
    logEvent("info", "manual_override_applied", {
      requested_provider: override.provider,
      policy_provider: policy.provider,
      warnings: override.warnings,
    });
    if (override.provider === "llama") {
      addLlama(false);
      addGemini(true);
    }
    if (override.provider === "gemini") addGemini(false);
    addDeterministic();
    return { candidates, classification, policy };
  }

  if (override.provider === "llama" && !policy.disableLlama && riskAllowsProvider(classification.risk_level, "llama")) {
    addLlama(false);
    addGemini(true);
  } else {
    addGemini(false);
  }

  addDeterministic();
  return { candidates, classification, policy };
}

function resolveFallbackReason(lastError: string, candidates: BackendCandidate[]): FallbackReason {
  if (!lastError.trim()) return "no_candidate_backend";
  if (candidates.length === 0) return "no_candidate_backend";
  const errorClassification = classifyProviderError(lastError);
  if (errorClassification.type === "model_deprecated") return "provider_model_deprecated";
  if (errorClassification.type === "quota_exceeded") return "provider_quota_exceeded";
  if (errorClassification.type === "auth_error") return "provider_api_key_invalid";
  if (errorClassification.type === "timeout") return "provider_timeout";
  if (errorClassification.type === "health_error") return "provider_health_invalid";
  if (errorClassification.type === "malformed_response") return "schema_validation_failed";
  const normalized = lastError.toLowerCase();
  if (normalized.includes("timed out")) return "provider_timeout";
  if (normalized.includes("health")) return "provider_health_invalid";
  if (normalized.includes("confidence")) return "low_confidence";
  if (normalized.includes("validation") || normalized.includes("schema") || normalized.includes("json")) return "schema_validation_failed";
  if (normalized.includes("api key") || normalized.includes("unauthorized") || normalized.includes("permission")) return "provider_api_key_invalid";
  return "schema_validation_failed";
}

async function createCompletion(messages: Array<{ role: "system" | "user"; content: string }>, client: any, modelOverride?: string): Promise<CompletionResult> {
  if (!client) {
    throw new Error("No AI client available for completion.");
  }

  if (client === ollamaClient) {
    if (!ollamaClient) {
      throw new Error("Ollama client not available.");
    }

    // Resolve and validate Ollama model
    const { resolvedModel, status, availableModels } = resolveOllamaModel(OLLAMA_MODEL);

    // Convert messages to Ollama format
    const prompt = messages.map(msg => {
      if (msg.role === "system") return `System: ${msg.content}`;
      if (msg.role === "user") return `User: ${msg.content}`;
      return msg.content;
    }).join("\n\n");

    const stream = ollamaClient.generate(resolvedModel, prompt, {
      parameters: {
        temperature: 0.2,
        top_k: 40,
        top_p: 0.9,
      }
    });

    let content = "";
    for await (const chunk of stream) {
      content += chunk;
    }

    if (!content) {
      throw new Error("Ollama returned an empty completion.");
    }

    const tokens = Math.ceil(content.length / 4); // Rough estimation

    return {
      content,
      tokens,
      model: resolvedModel
    };
  }

  if (client === geminiClient) {
    if (!geminiClient) {
      throw new Error("Gemini client not available.");
    }

    const selectedModel = modelOverride || ACTIVE_GEMINI_MODEL;
    const model = geminiClient.getGenerativeModel({
      model: selectedModel,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 900,
      },
    });

    const prompt = messages.map(msg => {
      if (msg.role === "system") return `System: ${msg.content}`;
      if (msg.role === "user") return `User: ${msg.content}`;
      return msg.content;
    }).join("\n\n");

    const completion = await model.generateContent(prompt);
    const content = completion.response.text();
    if (!content) {
      throw new Error("Gemini returned an empty completion.");
    }

    const tokens = Math.ceil(content.length / 4);

    return { content, tokens, model: selectedModel };
  }

  throw new Error("Unsupported AI client.");
}

function getProviderExecutionPolicy(backend: string) {
  return backend === "gemini" ? PROVIDER_EXECUTION_POLICIES.gemini : PROVIDER_EXECUTION_POLICIES.llama;
}

function withCompletionTimeout<T>(promise: Promise<T>, backend: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${backend} completion timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export async function promptToSpec(prompt: string, context?: string, preferredBackend: string = "auto", strictJson: boolean = false): Promise<CompletionResult & { spec: NormalizedSpec; ai_backend: AiBackend; json_validation: { is_valid: boolean; attempts: number; auto_fixed: boolean }; confidence: ConfidenceReport; quality_breakdown: QualityBreakdown; classification_trace?: ClassificationResult["classification_trace"]; fallback_info: FallbackInfo } & ProviderRuntimeInfo> {
  const createUserPrompt = (attempt: number, previousErrors: string[]) => {
    const basePrompt = [`Raw prompt:\n${prompt}`];
    if (context?.trim()) {
      basePrompt.push(`Context:\n${context.trim()}`);
    }

    let retryHint = "";
    if (attempt > 1) {
      const errorSummary = previousErrors.length > 0 ? ` Errors: ${previousErrors.join("; ")}` : "";
      if (attempt === 2) {
        retryHint = `\n\nCRITICAL: Previous attempt failed validation${errorSummary}. You MUST return ONLY valid JSON with no text outside the JSON object. Ensure input_fields and output_fields are not empty. Each field must have "type" and "description". No generic "result" fields.`;
      } else if (attempt === 3) {
        retryHint = `\n\nFINAL ATTEMPT: Previous attempts failed${errorSummary}. Return ONLY this exact JSON structure:
{
  "task_instruction": "Detailed specific instruction here",
  "input_fields": {
    "primary_input": {
      "type": "string",
      "description": "Description of what this input represents"
    }
  },
  "output_fields": {
    "specific_output": {
      "type": "string",
      "description": "Description of the output format"
    }
  }
}
No explanations, no markdown, just the JSON object.`;
      }
    }

    return `${basePrompt.join("\n\n")}${retryHint}`;
  };

  const generateContextAwareFallback = (): PromptSpec => {
    const normalizedPrompt = prompt.trim().replace(/\s+/g, " ");
    const lowerPrompt = normalizedPrompt.toLowerCase();

    // Infer task instruction
    let taskInstruction = "Process and respond to the user's request";
    if (lowerPrompt.includes('code') || lowerPrompt.includes('program')) {
      taskInstruction = "Analyze and process code-related requests with structured input and output specifications";
    } else if (lowerPrompt.includes('text') || lowerPrompt.includes('write')) {
      taskInstruction = "Generate or process text content with clear input parameters and output formats";
    } else if (lowerPrompt.includes('data') || lowerPrompt.includes('analyze')) {
      taskInstruction = "Process data and provide analytical results with defined input structure and output metrics";
    } else if (normalizedPrompt) {
      taskInstruction = `Handle the following user request: ${normalizedPrompt}`;
    }

    const inputFields: Record<string, any> = {};

    // Always include primary input
    if (lowerPrompt.includes('code')) {
      inputFields.code = {
        type: "string",
        description: "The code snippet or program to be processed.",
      };
    } else if (lowerPrompt.includes('text') || lowerPrompt.includes('content')) {
      inputFields.content = {
        type: "string",
        description: "The text content to be processed or generated.",
      };
    } else {
      inputFields.user_request = {
        type: "string",
        description: "The user's specific request or query to be addressed.",
      };
    }

    // Add context if provided
    if (context?.trim()) {
      inputFields.context = {
        type: "string",
        description: "Additional context or background information for processing the request.",
      };
    }

    // Add parameters if prompt suggests configuration
    if (lowerPrompt.includes('config') || lowerPrompt.includes('parameter')) {
      inputFields.parameters = {
        type: "object",
        description: "Configuration parameters or settings for the processing task.",
      };
    }

    const outputFields: Record<string, any> = {};

    // Infer output based on prompt
    if (lowerPrompt.includes('analyze') || lowerPrompt.includes('review')) {
      outputFields.analysis = {
        type: "object",
        description: "Detailed analysis results with findings and recommendations.",
      };
      outputFields.summary = {
        type: "string",
        description: "Concise summary of the analysis.",
      };
    } else if (lowerPrompt.includes('generate') || lowerPrompt.includes('create')) {
      outputFields.generated_content = {
        type: "string",
        description: "The generated content or result based on the input parameters.",
      };
      outputFields.metadata = {
        type: "object",
        description: "Metadata about the generation process and output characteristics.",
      };
    } else {
      outputFields.response = {
        type: "string",
        description: "The processed response or result addressing the user's request.",
      };
      outputFields.status = {
        type: "string",
        description: "Status indicator showing success or any issues encountered.",
      };
    }

    return {
      task_instruction: taskInstruction,
      input_fields: inputFields,
      output_fields: outputFields,
    };
  };

  const trace = createTraceContext();
  const cachePrompt = context?.trim() ? `${prompt.trim()}\n\n${context.trim()}` : prompt.trim();
  const semanticHit = semanticSpecCache.get(cachePrompt);
  if (semanticHit) {
    logEvent("info", "semantic_cache_hit", {
      similarity: Number(semanticHit.similarity.toFixed(2)),
      cache_key: semanticHit.entry.key,
    }, trace);
    return {
      content: JSON.stringify(semanticHit.entry.value),
      tokens: 0,
      model: "semantic-cache",
      spec: semanticHit.entry.value,
      ai_backend: { provider: "semantic_cache", model: "semantic-cache", fallback_used: true },
      json_validation: { is_valid: true, attempts: 1, auto_fixed: false },
      confidence: {
        classification: 9,
        schema_match: 9,
        semantic_alignment: 9,
        ai_stability: 10,
        provider_reliability: 10,
        template_alignment: 9,
        validation_confidence: 9,
      },
      quality_breakdown: {
        structural_quality: 9,
        semantic_precision: 9,
        intent_match: 9,
        template_fit: 9,
        provider_execution_quality: 10,
      },
      fallback_info: {
        used_fallback: true,
        fallback_type: "semantic_cache",
      },
      provider_state: getAllProviderStates(),
      model_failover_trace: [],
      candidate_backends: ["semantic_cache"],
      classification_decision: undefined,
    };
  }

  const { candidates, classification, policy } = selectBackend(preferredBackend, prompt);
  const candidateBackends = candidates.map((candidate) => candidate.backend.provider);
  const modelFailoverTrace: ModelFailoverEvent[] = [];
  incrementMetric("routing_requests");
  logEvent("info", "prompt_classified", {
    prompt_type: classification.prompt_type,
    semantic_intent: classification.semantic_intent,
    complexity_score: classification.complexity_score,
    risk_level: classification.risk_level,
    routing_recommendation: classification.routing_recommendation,
    policy_provider: policy.provider,
    min_confidence: policy.minConfidence,
  }, trace);
  logEvent("info", "classification_trace_generated", {
    intent_scores: classification.classification_trace.intent_scores,
    negative_penalties: classification.classification_trace.negative_penalties,
    boosts: classification.classification_trace.boosts,
    final_scores: classification.classification_trace.final_scores,
    ambiguity_detected: classification.classification_trace.ambiguity_detected,
    confidence_gap: classification.classification_trace.confidence_gap,
    action_intent: classification.classification_trace.action_intent,
  }, trace);
  logEvent("info", "hierarchical_classification_completed", {
    semantic_intent: classification.semantic_intent,
    classification_decision: classification.classification_decision,
  }, trace);
  if (classification.classification_trace.action_intent) {
    logEvent("info", "verb_intent_boost_applied", {
      action_intent: classification.classification_trace.action_intent,
      domain: classification.classification_trace.domain,
      task: classification.classification_trace.task,
      reason: classification.classification_trace.decision_reason,
    }, trace);
  }
  if (classification.classification_trace.ambiguity_detected) {
    logEvent("warn", "confidence_gap_detected", {
      semantic_intent: classification.semantic_intent,
      confidence_gap: classification.classification_trace.confidence_gap,
      reason: classification.classification_trace.decision_reason,
    }, trace);
  }
  for (const [intent, penalty] of Object.entries(classification.classification_trace.negative_penalties)) {
    if (penalty < 0) {
      logEvent("debug", "negative_penalty_applied", { intent, penalty }, trace);
    }
  }
  for (const [intent, boost] of Object.entries(classification.classification_trace.boosts)) {
    if (boost > 0) {
      logEvent("debug", "domain_boost_applied", { intent, boost }, trace);
    }
  }
  logEvent("info", "backend_selected", {
    selected_backend: candidates[0]?.backend.provider ?? "local_fallback",
    candidate_backends: candidateBackends,
    prompt_type: classification.prompt_type,
  }, trace);

  const composition = resolveTemplateComposition(prompt, classification);
  const template = composition.composed;
  const fallbackPlan = createDeterministicPlan({
    intent: classification.semantic_intent,
    requiredInputs: template.inputs,
    requiredOutputs: template.outputs,
    riskLevel: classification.risk_level,
    suggestedTemplate: template.id,
  });
  logEvent("info", "template_selected", {
    template_id: template.id,
    template_version: template.version,
    composed_templates: composition.templates.map((item) => item.id),
    conflicts: composition.conflicts,
    rejections: composition.rejections,
  }, trace);
  if (composition.rejections.length > 0) {
    logEvent("warn", "composition_rejected", {
      primary_intent: classification.semantic_intent,
      rejections: composition.rejections,
    }, trace);
  }

  let lastError = "";
  let rawAiResponse = "";
  let parsedSpec: unknown = null;
  let jsonValidation = { is_valid: false, attempts: 0, auto_fixed: false };

  for (const candidate of candidates) {
    const { client, backend } = candidate;
    if (candidate.deterministic) continue;
    const providerPolicy = getProviderExecutionPolicy(backend.provider);
    const maxProviderAttempts = Math.min(Math.max(MAX_GENERATION_ATTEMPTS, policy.retries), providerPolicy.maxRetries + 1);
    const modelChain = backend.provider === "gemini" ? buildGeminiModelFailoverChain(backend.model) : [backend.model];

    for (const modelCandidate of modelChain) {
      if (backend.provider === "gemini") {
        const staticValidation = validateProviderModel("gemini", modelCandidate, ["json_generation", "spec_generation"]);
        modelFailoverTrace.push({ provider: "gemini", model: modelCandidate, action: "attempt" });
        if (!staticValidation.valid) {
          updateProviderStateFromError("gemini", staticValidation.issues.join("; "));
          modelFailoverTrace.push({ provider: "gemini", model: modelCandidate, error_type: "model_deprecated", action: "try_next_model" });
          logEvent("warn", "model_deprecated_detected", { provider: "gemini", model: modelCandidate, issues: staticValidation.issues }, trace);
          logEvent("info", "model_failover_attempted", { provider: "gemini", failed_model: modelCandidate, reason: "model_deprecated" }, trace);
          lastError = staticValidation.issues.join("; ");
          continue;
        }
      }

      for (let attempt = 1; attempt <= maxProviderAttempts; attempt += 1) {
        const attemptStartedAt = Date.now();
        try {
          const completion = await withCompletionTimeout(createCompletion([
          { role: "system", content: backend.provider === "gemini" ? GEMINI_PLANNER_INSTRUCTION : SYSTEM_INSTRUCTION },
          { role: "user", content: createUserPrompt(attempt, [lastError]).trim() },
        ], client, modelCandidate), backend.provider, providerPolicy.timeoutMs);
        if (backend.provider === "gemini") {
          markProviderModelAvailable("gemini");
          modelFailoverTrace.push({ provider: "gemini", model: modelCandidate, action: "selected" });
        }
        const latencyMs = Date.now() - attemptStartedAt;
        observeMetric("provider_latency", latencyMs);
        backend.model = completion.model;

        rawAiResponse = completion.content;
        logEvent("debug", "ai_response_received", {
          attempt,
          ai_response: rawAiResponse,
          backend: backend.provider,
          prompt_type: backend.prompt_type,
          model: completion.model,
        });

        try {
          let parseResult = parseJson<unknown>(completion.content);
          parsedSpec = parseResult;
          jsonValidation = { is_valid: true, attempts: 1, auto_fixed: false };
        } catch (parseError) {
          const fixed = parseJsonWithRetry<unknown>(completion.content, true);
          parsedSpec = fixed.parsed;
          jsonValidation = { is_valid: true, attempts: fixed.attempts, auto_fixed: fixed.autoFixed };
        }

        const plan = backend.provider === "gemini" ? parsePlanDocument(parsedSpec, fallbackPlan) : fallbackPlan;
        const baseSpec = backend.provider === "gemini"
          ? buildSpecFromTemplate(template, prompt, plan.required_inputs, plan.required_outputs)
          : parsedSpec as PromptSpec;
        const validationResult = validateSpec(baseSpec);
        if (validationResult.valid) {
          const { improvedSpec, improvements } = improveWithLearning(baseSpec, prompt);
          const boundary = enforceLearningBoundaries(improvedSpec, classification.semantic_intent);
          if (boundary.violations.length > 0) {
            logEvent("warn", "learning_boundary_enforced", {
              intent: classification.semantic_intent,
              blocked_outputs: boundary.violations,
            }, trace);
          }
          const { spec: finalSpec, qualityScore, appliedFixes } = enforceQualityStandards(boundary.spec, prompt);
          const confidence = calculateConfidence({
            classification,
            spec: finalSpec,
            validationIssues: validationResult.issues,
            templateFields: { inputs: template.inputs, outputs: template.outputs },
            fallbackUsed: backend.fallback_used,
            providerReliability: getProviderHealth(backend.provider === "gemini" ? "gemini" : "llama").reliability,
          });
          const qualityBreakdown = calculateQualityBreakdown({
            confidence,
            fallbackUsed: backend.fallback_used,
            provider: backend.provider,
          });
          const safety = validateSpecSafety(finalSpec);

          if (qualityScore < 8) {
            logEvent("warn", "quality_rejected", { quality_score: qualityScore, backend: backend.provider }, trace);
            lastError = `Quality score ${qualityScore} below threshold 8. Applied fixes: ${appliedFixes.join(", ")}`;
            break;
          }

          if (confidence.validation_confidence < policy.minConfidence || confidence.schema_match < policy.minConfidence) {
            incrementMetric("low_confidence_rejections");
            lastError = `Confidence below policy threshold ${policy.minConfidence}`;
            logEvent("warn", "quality_rejected", { reason: "low_confidence", confidence, policy }, trace);
            break;
          }

          if (!safety.allowed) {
            incrementMetric("unsafe_output_blocks");
            lastError = `Safety validation failed: ${safety.issues.join("; ")}`;
            logEvent("error", "unsafe_output_blocked", { issues: safety.issues, backend: backend.provider }, trace);
            break;
          }

          addToHistory({
            prompt,
            generated_spec: finalSpec,
            quality_score: qualityScore,
            feedback_score: 0,
            iterations: attempt,
            backend_used: backend.provider
          });

          const normalizedSpec = normalizeSpec(finalSpec);
          if (!backend.fallback_used && ["gemini", "llama"].includes(backend.provider) && confidence.semantic_alignment >= 8 && confidence.template_alignment >= 8) {
            semanticSpecCache.set(cachePrompt, cachePrompt, normalizedSpec);
          } else {
            incrementMetric("semantic_cache_poison_prevention_count");
            logEvent("info", "semantic_cache_write_skipped", {
              provider: backend.provider,
              fallback_used: backend.fallback_used,
              semantic_alignment: confidence.semantic_alignment,
              template_alignment: confidence.template_alignment,
            }, trace);
          }
          recordProviderResult(backend.provider === "gemini" ? "gemini" : "llama", true, latencyMs);
          incrementMetric("routing_success");

          logEvent("debug", "spec_generated", {
            prompt,
            preferredBackend,
            prompt_type: classification.prompt_type,
            selected_backend: backend.provider,
            strictJson,
            retryCount: attempt,
            improvements_applied: improvements,
            quality_score: qualityScore,
            quality_fixes: appliedFixes,
          }, trace);

          return {
            ...completion,
            spec: normalizedSpec,
            ai_backend: backend,
            json_validation: jsonValidation,
            confidence,
            quality_breakdown: qualityBreakdown,
            fallback_info: {
              used_fallback: backend.fallback_used,
              fallback_type: backend.fallback_used ? "intent_specific" : "none",
            },
            classification_trace: classification.classification_trace,
            provider_state: getAllProviderStates(),
            model_failover_trace: modelFailoverTrace,
            candidate_backends: candidateBackends,
            classification_decision: classification.classification_decision,
          };
        }

        lastError = `Validation failed: ${validationResult.issues.join("; ")}`;
        logEvent("warn", "schema_validation_failed", { attempt, issues: validationResult.issues, backend: backend.provider }, trace);
        break;
        } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        const providerError = classifyProviderError(error);
        updateProviderStateFromError(backend.provider === "gemini" ? "gemini" : "llama", error);
        logEvent("warn", "provider_error_classified", { provider: backend.provider, model: modelCandidate, error_type: providerError.type, action: providerError.action }, trace);
        logEvent("info", "provider_state_updated", { provider: backend.provider, provider_state: getProviderState(backend.provider === "gemini" ? "gemini" : "llama") }, trace);
        if (providerError.type === "model_deprecated") {
          modelFailoverTrace.push({ provider: "gemini", model: modelCandidate, error_type: providerError.type, action: "try_next_model" });
          logEvent("warn", "model_deprecated_detected", { provider: backend.provider, model: modelCandidate, error: lastError }, trace);
          logEvent("info", "model_failover_attempted", { provider: backend.provider, failed_model: modelCandidate, reason: providerError.type }, trace);
        }
        if (providerError.type === "timeout") {
          incrementMetric("provider_timeout_rate");
          logEvent("warn", "provider_timeout", { attempt, backend: backend.provider, timeout_ms: providerPolicy.timeoutMs }, trace);
        }
        recordProviderFailure(backend.provider === "gemini" ? "gemini" : "llama", Date.now() - attemptStartedAt, { affectsReliability: providerError.affectsReliability });
        logEvent("warn", "retry_attempt", { attempt, reason: lastError, backend: backend.provider }, trace);
        if (backend.provider === "gemini" && shouldTryNextGeminiModel(providerError)) break;
        if (backend.provider === "gemini" && providerError.type === "quota_exceeded") break;
        const jsonInvalid = /parse JSON|extract JSON|JSON/.test(lastError);
        if (!jsonInvalid || attempt >= maxProviderAttempts) break;
        }
      }
      const lastProviderError = classifyProviderError(lastError);
      if (backend.provider !== "gemini" || !shouldTryNextGeminiModel(lastProviderError)) break;
    }
  }
  if (modelFailoverTrace.length > 0 && !modelFailoverTrace.some((event) => event.action === "selected")) {
    modelFailoverTrace.push({ provider: "gemini", model: ACTIVE_GEMINI_MODEL, action: "exhausted" });
  }

  // Fast deterministic fallback - no AI calls, no learning enrichment.
  const fallbackReason = resolveFallbackReason(lastError, candidates);
  const fallbackResolution: SafeFallbackResolution = resolveSafeFallbackTemplate(classification, fallbackReason);
  const safeFallbackTemplate = fallbackResolution.template;
  logEvent("warn", "fallback_template_selected", {
    template_id: fallbackResolution.selectedFallbackTemplate,
    fallback_type: fallbackResolution.fallbackType,
    fallback_reason: fallbackResolution.fallbackReason,
    original_intent: classification.semantic_intent,
    warnings: fallbackResolution.warnings,
  }, trace);
  logEvent("warn", "fallback_reason_recorded", {
    fallback_reason: fallbackResolution.fallbackReason,
    original_intent: classification.semantic_intent,
    selected_fallback_template: fallbackResolution.selectedFallbackTemplate,
  }, trace);
  if (fallbackResolution.fallbackType === "intent_specific") {
    incrementMetric("intent_specific_fallback_rate");
    logEvent("info", "intent_specific_fallback_selected", {
      intent: classification.semantic_intent,
      template_id: fallbackResolution.selectedFallbackTemplate,
      confidence: classification.confidence,
    }, trace);
  } else {
    incrementMetric("generic_fallback_rate");
  }

  const fallbackSpec: PromptSpec = buildSpecFromTemplate(safeFallbackTemplate, prompt, safeFallbackTemplate.inputs, safeFallbackTemplate.outputs);
  const { spec: qualityEnforcedFallback, violations: fallbackBoundaryViolations } = enforceLearningBoundaries(fallbackSpec, safeFallbackTemplate.id);
  const qualityScore = calculateQualityScore(qualityEnforcedFallback);

  const fallbackConfidence = calculateConfidence({
    classification,
    spec: qualityEnforcedFallback,
    validationIssues: [],
    templateFields: { inputs: safeFallbackTemplate.inputs, outputs: safeFallbackTemplate.outputs },
    fallbackUsed: true,
    providerReliability: getProviderHealth("fallback").reliability,
  });
  const fallbackQualityBreakdown = calculateQualityBreakdown({
    confidence: fallbackConfidence,
    fallbackUsed: true,
    fallbackType: fallbackResolution.fallbackType,
    provider: "fallback",
  });
  incrementMetric("fallback_rate");
  incrementMetric("semantic_cache_poison_prevention_count");
  recordProviderResult("fallback", true, 0);
  logEvent("info", "quality_breakdown_generated", { ...fallbackQualityBreakdown }, trace);
  logEvent("info", "semantic_cache_write_skipped", {
    provider: "fallback",
    fallback_type: fallbackResolution.fallbackType,
    fallback_reason: fallbackResolution.fallbackReason,
  }, trace);

  logEvent("warn", "fallback_triggered", {
    prompt,
    preferredBackend,
    strictJson,
    retryCount: 1,
    lastError,
    fallback_spec: qualityEnforcedFallback,
    learning_boundary_violations: fallbackBoundaryViolations,
  }, trace);

  // Store fallback in history
  addToHistory({
    prompt,
    generated_spec: qualityEnforcedFallback,
    quality_score: qualityScore,
    feedback_score: 0,
    iterations: 1,
    backend_used: 'fallback'
  });

  // Final safety net: ensure fallback is valid
  const fallbackValidation = validateSpec(qualityEnforcedFallback);
  if (!fallbackValidation.valid) {
    logEvent("error", "schema_validation_failed", { fallback: "hardcoded", issues: fallbackValidation.issues });
    const hardcodedSpec: PromptSpec = {
      task_instruction: "Process user requests with structured input and output",
      input_fields: {
        user_input: {
          type: "string",
          description: "The user's input or request to be processed"
        }
      },
      output_fields: {
        response: {
          type: "string",
          description: "The processed response or result"
        },
        status: {
          type: "string",
          description: "Status of the processing operation"
        }
      }
    };
    return {
      content: JSON.stringify(hardcodedSpec),
      tokens: 0,
      model: "fallback",
      spec: normalizeSpec(hardcodedSpec),
      ai_backend: {
        provider: "fallback",
        model: "fallback",
        fallback_used: true,
        prompt_type: classification.prompt_type,
        semantic_intent: classification.semantic_intent,
        risk_level: classification.risk_level,
      },
      json_validation: { is_valid: true, attempts: 1, auto_fixed: false },
      confidence: fallbackConfidence,
      quality_breakdown: fallbackQualityBreakdown,
      fallback_info: {
        used_fallback: true,
        fallback_type: "generic",
        fallback_reason: "schema_validation_failed",
        original_intent: classification.semantic_intent,
        selected_fallback_template: "general_spec",
      },
      classification_trace: classification.classification_trace,
      provider_state: getAllProviderStates(),
      model_failover_trace: modelFailoverTrace,
      candidate_backends: candidateBackends,
      classification_decision: classification.classification_decision,
    };
  }

  const normalizedFallbackSpec = normalizeSpec(qualityEnforcedFallback);

  return {
    content: JSON.stringify(qualityEnforcedFallback),
    tokens: 0,
    model: "fallback",
    spec: normalizedFallbackSpec,
    ai_backend: {
      provider: "fallback",
      model: "fallback",
      fallback_used: true,
      prompt_type: classification.prompt_type,
      semantic_intent: classification.semantic_intent,
      risk_level: classification.risk_level,
    },
    json_validation: { is_valid: true, attempts: 1, auto_fixed: false },
    confidence: fallbackConfidence,
    quality_breakdown: fallbackQualityBreakdown,
    fallback_info: {
      used_fallback: true,
      fallback_type: fallbackResolution.fallbackType,
      fallback_reason: fallbackResolution.fallbackReason,
      original_intent: classification.semantic_intent,
      selected_fallback_template: fallbackResolution.selectedFallbackTemplate,
    },
    classification_trace: classification.classification_trace,
    provider_state: getAllProviderStates(),
    model_failover_trace: modelFailoverTrace,
    candidate_backends: candidateBackends,
    classification_decision: classification.classification_decision,
  };
}

export function validateSpec(spec: unknown): { valid: boolean; issues: string[] } {
  try {
    const normalized = normalizeSpec(spec);
    return validateConsistency(normalized);
  } catch (error) {
    return {
      valid: false,
      issues: [`Normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

type AiImprovementResult = {
  prompt_spec: PromptSpec;
  improvements_applied: string;
};

export async function improveSpec(spec: unknown, issues: string[] = [], context?: string, preferredBackend: "llama" | "ollama" | "gemini" | "auto" = "auto", strictJson: boolean = false): Promise<AiImprovementResult & CompletionResult & { ai_backend: AiBackend; json_validation: { is_valid: boolean; attempts: number; auto_fixed: boolean } }> {
  const routingPrompt = [context, ...issues].filter(Boolean).join("\n");
  const { candidates } = selectBackend(preferredBackend, routingPrompt);
  const candidate = candidates[0];

  if (!candidate) {
    throw new Error("No AI backend configured for improvements. Please set GEMINI_API_KEY or enable Ollama.");
  }

  const { client, backend } = candidate;

  const safeSpec = typeof spec === "string" ? { raw_spec: spec } : spec;
  const problemSummary = issues.length > 0 ? issues.join("\n") : "No explicit validation issues were provided.";

  let completion: CompletionResult;

  try {
    completion = await withCompletionTimeout(createCompletion([
      { role: "system", content: IMPROVEMENT_INSTRUCTION },
      {
        role: "user",
        content: `Current spec: ${JSON.stringify(safeSpec, null, 2)}\n\nValidation issues:\n${problemSummary}`,
      },
    ], client), backend.provider, getProviderExecutionPolicy(backend.provider).timeoutMs);
  } catch (error) {
    logEvent("warn", "fallback_triggered", { stage: "improve_spec", reason: error instanceof Error ? error.message : String(error) });
    const promptSpecValidation = promptSpecSchema.safeParse(spec);
    const validFallbackSpec: PromptSpec = promptSpecValidation.success && validateSpec(promptSpecValidation.data).valid
      ? promptSpecValidation.data
      : {
          task_instruction: "Process and improve user requests with structured validation",
          input_fields: {
            original_spec: {
              type: "object",
              description: "The original specification to be improved"
            },
            validation_issues: {
              type: "array",
              description: "List of issues found in the original specification"
            }
          },
          output_fields: {
            improved_spec: {
              type: "object",
              description: "The corrected and improved specification"
            },
            changes_made: {
              type: "string",
              description: "Description of improvements applied"
            }
          }
        };

    return {
      content: JSON.stringify({
        prompt_spec: validFallbackSpec,
        improvements_applied: "Valid fallback improvement applied because AI invocation failed.",
      }),
      tokens: 0,
      model: "fallback",
      prompt_spec: validFallbackSpec,
      improvements_applied: "Valid fallback improvement applied because AI invocation failed.",
      ai_backend: { provider: "fallback", model: "fallback", fallback_used: true },
      json_validation: { is_valid: true, attempts: 1, auto_fixed: false }
    };
  }

  // Parse the completion with strict JSON validation if requested
  let parsed: AiImprovementResult;
  let jsonValidation: { is_valid: boolean; attempts: number; auto_fixed: boolean };

  if (strictJson) {
    const jsonResult = parseJsonWithRetry<AiImprovementResult>(completion.content, true);
    parsed = jsonResult.parsed;
    jsonValidation = {
      is_valid: true,
      attempts: jsonResult.attempts,
      auto_fixed: jsonResult.autoFixed
    };
  } else {
    parsed = parseJson<AiImprovementResult>(completion.content);
    jsonValidation = { is_valid: true, attempts: 1, auto_fixed: false };
  }

  const promptSpecValidation = promptSpecSchema.safeParse(parsed.prompt_spec);
  if (!promptSpecValidation.success) {
    throw new Error(`Improved prompt_spec failed validation: ${promptSpecValidation.error.message}`);
  }

  return {
    ...completion,
    ...parsed,
    ai_backend: backend,
    json_validation: jsonValidation
  };
}

export function calculateQuality(valid: boolean, iterations: number): number {
  const base = valid ? 9 : 4;
  const penalty = Math.min(iterations - 1, 3) * 1.5;
  return Math.max(0, Math.min(10, base - penalty));
}

export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]/g, '_')
    .toLowerCase()
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
}

export function normalizeFieldName(name: string): string {
  const snakeCase = toSnakeCase(name);
  if (isCanonicalField(snakeCase)) return snakeCase;
  // Ensure it's a valid identifier and not too generic
  if (snakeCase.length < 3) return `field_${snakeCase}`;
  if (['result', 'output', 'data', 'value', 'response'].includes(snakeCase)) {
    return `${snakeCase}_data`;
  }
  return snakeCase;
}

function normalizeFieldType(type: string): string {
  const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
  return validTypes.includes(type.toLowerCase()) ? type.toLowerCase() : 'string';
}

function generateFieldDescription(fieldName: string): string {
  const descriptions: Record<string, string> = {
    code_snippet: 'The code snippet or program to be processed',
    language: 'Programming language of the code',
    component_name: 'Name of the UI component',
    props: 'Component properties and configuration',
    endpoint: 'API endpoint URL',
    method: 'HTTP method',
    payload: 'Request payload or parameters',
    data_source: 'Source of the data to process',
    query: 'Query or operation to perform',
    results: 'Query results or processed data',
    content: 'Text content to process or generate',
    parameters: 'Processing parameters and options',
    response_schema: 'Expected response structure',
    status_codes: 'Possible HTTP status codes and meanings'
  };

  return descriptions[fieldName] || `The ${fieldName.replace(/_/g, ' ')} for this operation`;
}

export function normalizeInputFields(fields: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};

  Object.entries(fields).forEach(([key, field]) => {
    const normalizedKey = normalizeFieldName(key);
    const normalizedField: any = {
      type: normalizeFieldType(field?.type || 'string'),
      description: field?.description || generateFieldDescription(normalizedKey)
    };

    // Preserve enriched structures if present
    if (field?.properties) {
      normalizedField.properties = field.properties;
    }
    if (field?.items) {
      normalizedField.items = field.items;
    }

    normalized[normalizedKey] = normalizedField;
  });

  return normalized;
}

export function normalizeOutputFields(fields: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};

  Object.entries(fields).forEach(([key, field]) => {
    const normalizedKey = normalizeFieldName(key);
    const type = normalizeFieldType(field?.type || 'string');

    // Preserve enriched structures (properties, items) if present
    let normalizedField: any = {
      type,
      description: field?.description || generateFieldDescription(normalizedKey)
    };

    // Preserve nested properties for enriched specs
    if (field?.properties) {
      normalizedField.properties = field.properties;
    }
    if (field?.items) {
      normalizedField.items = field.items;
    }
    if (field?.enum) {
      normalizedField.enum = field.enum;
    }
    if (field?.required) {
      normalizedField.required = field.required;
    }

    normalized[normalizedKey] = normalizedField;
  });

  // Ensure at least one structured output if empty
  const hasStructured = Object.values(normalized).some((field: any) => field.type === 'object' || field.type === 'array');
  if (Object.keys(normalized).length === 0 || !hasStructured) {
    normalized.structured_result = {
      type: 'object',
      description: 'Structured result containing all processing outputs',
      properties: {
        data: {
          type: 'object',
          description: 'The main structured data result'
        },
        metadata: {
          type: 'object',
          description: 'Metadata about the processing operation'
        }
      }
    };
  }

  return normalized;
}

export function normalizeTaskInstruction(instruction: string): string {
  if (!instruction || typeof instruction !== 'string') {
    return 'Process the input data and generate appropriate output';
  }

  const trimmed = instruction.trim();
  if (trimmed.length < 10) {
    return `Process user request: ${trimmed}`;
  }

  // Capitalize first letter if not already
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export interface NormalizedSpec {
  task_instruction: string;
  input_fields: Record<string, { type: string; description: string }>;
  output_fields: Record<string, { type: string; description: string }>;
  metadata?: {
    normalized_at: string;
    original_field_count: { input: number; output: number };
    field_name_changes: Record<string, string>;
  };
}

export function normalizeSpec(spec: unknown): NormalizedSpec {
  if (!spec || typeof spec !== 'object') {
    throw new Error('Invalid spec: must be an object');
  }

  const specObj = spec as any;
  const fieldNameChanges: Record<string, string> = {};

  // Extract and normalize task instruction
  const taskInstruction = normalizeTaskInstruction(specObj.task_instruction || specObj.instruction || '');

  // Extract and normalize input fields
  const rawInputFields = specObj.input_fields || specObj.inputs || {};
  const inputFields = normalizeInputFields(rawInputFields);

  // Track field name changes for input fields
  for (const [originalKey, value] of Object.entries(rawInputFields)) {
    const normalizedKey = normalizeFieldName(originalKey);
    if (originalKey !== normalizedKey) {
      fieldNameChanges[`input.${originalKey}`] = normalizedKey;
    }
  }

  // Extract and normalize output fields
  const rawOutputFields = specObj.output_fields || specObj.outputs || {};
  const outputFields = normalizeOutputFields(rawOutputFields);

  // Track field name changes for output fields
  for (const [originalKey, value] of Object.entries(rawOutputFields)) {
    const normalizedKey = normalizeFieldName(originalKey);
    if (originalKey !== normalizedKey) {
      fieldNameChanges[`output.${originalKey}`] = normalizedKey;
    }
  }

  return {
    task_instruction: taskInstruction,
    input_fields: inputFields,
    output_fields: outputFields,
    metadata: {
      normalized_at: new Date().toISOString(),
      original_field_count: {
        input: Object.keys(rawInputFields).length,
        output: Object.keys(rawOutputFields).length
      },
      field_name_changes: fieldNameChanges
    }
  };
}

export function validateConsistency(spec: NormalizedSpec): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for empty fields
  if (!spec.task_instruction.trim()) {
    issues.push('Task instruction is empty');
  }

  if (Object.keys(spec.input_fields).length === 0) {
    issues.push('No input fields defined');
  }

  if (Object.keys(spec.output_fields).length === 0) {
    issues.push('No output fields defined');
  }

  // Check field validity
  for (const [key, field] of Object.entries(spec.input_fields)) {
    if (!field.type || !field.description) {
      issues.push(`Input field '${key}' missing type or description`);
    }
  }

  for (const [key, field] of Object.entries(spec.output_fields)) {
    if (!field.type || !field.description) {
      issues.push(`Output field '${key}' missing type or description`);
    }
  }

  issues.push(...validateSchemaCompatibility(spec.input_fields));
  issues.push(...validateSchemaCompatibility(spec.output_fields));

  // Check for generic field names
  const genericNames = ['result', 'output', 'data', 'value', 'response'];
  for (const key of Object.keys(spec.input_fields)) {
    if (genericNames.includes(key)) {
      issues.push(`Input field name '${key}' is too generic`);
    }
  }

  for (const key of Object.keys(spec.output_fields)) {
    if (genericNames.includes(key)) {
      issues.push(`Output field name '${key}' is too generic`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
