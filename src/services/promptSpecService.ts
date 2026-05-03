import { execSync } from 'child_process';
import { openAiClient, ollamaClient } from "../utils/openAiClient.js";
import { promptSpecSchema, PromptSpec } from "../schemas/promptSpec.js";
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const MODEL_NAME = "gpt-4o-mini";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const MAX_GENERATION_ATTEMPTS = 2;
const HISTORY_FILE = join(process.cwd(), 'promptSpecHistory.json');

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
    console.warn('Failed to load spec history:', error);
    specHistory = [];
  }
}

function saveHistory(): void {
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(specHistory, null, 2));
  } catch (error) {
    console.warn('Failed to save spec history:', error);
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

  // Apply high-quality input patterns
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
    improvedSpec.output_fields.response = { type: 'string', description: 'Primary response output based on learning' };
    improvements.push('Added default output field to prevent empty output_fields');
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
        const inferredFields = inferFieldsFromPrompt(prompt, 'output');
        return { ...spec, output_fields: inferredFields };
      }
      return spec;
    }
  },
  {
    description: 'no generic field names like "result"',
    check: (spec) => !Object.keys(spec.output_fields).includes('result'),
    fix: (spec, prompt) => {
      if (spec.output_fields.result) {
        delete spec.output_fields.result;
        const inferredFields = inferFieldsFromPrompt(prompt, 'output');
        return { ...spec, output_fields: { ...spec.output_fields, ...inferredFields } };
      }
      return spec;
    }
  },
  {
    description: 'task_instruction must be specific and actionable',
    check: (spec) => spec.task_instruction.length > 15 && !spec.task_instruction.toLowerCase().includes('generate something'),
    fix: (spec, prompt) => {
      if (spec.task_instruction.length <= 15 || spec.task_instruction.toLowerCase().includes('generate something')) {
        const enhanced = `Process and handle the following request: ${prompt}. ${spec.task_instruction}`;
        return { ...spec, task_instruction: enhanced };
      }
      return spec;
    }
  },
  {
    description: 'output should contain structured objects when applicable',
    check: (spec) => Object.values(spec.output_fields).some(field => (field as any).type === 'object' || (field as any).type === 'array'),
    fix: (spec, prompt) => {
      const hasStructured = Object.values(spec.output_fields).some(field => (field as any).type === 'object' || (field as any).type === 'array');
      if (!hasStructured) {
        const inferredFields = inferFieldsFromPrompt(prompt, 'output');
        const structuredFields = Object.fromEntries(
          Object.entries(inferredFields).filter(([, field]) => field.type === 'object' || field.type === 'array')
        );
        if (Object.keys(structuredFields).length > 0) {
          return { ...spec, output_fields: { ...spec.output_fields, ...structuredFields } };
        }
      }
      return spec;
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

  for (const rule of QUALITY_RULES) {
    if (!rule.check(currentSpec)) {
      console.debug(`Quality rule failed: ${rule.description}, applying fix`);
      currentSpec = rule.fix(currentSpec, prompt);
      appliedFixes.push(rule.description);
      qualityScore -= 1; // Deduct point for each fix needed
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

  // Bonus for structured outputs
  const hasStructuredOutput = Object.values(spec.output_fields).some(field => (field as any).type === 'object' || (field as any).type === 'array');
  if (hasStructuredOutput) score += 1;

  // Bonus for domain-specific fields
  const hasDomainFields = Object.keys(spec.input_fields).some(key => !['user_input', 'input'].includes(key));
  if (hasDomainFields) score += 1;

  return Math.max(0, Math.min(10, score));
}

// Schema Normalization and Standardization System
interface NormalizedSpec {
  prompt_spec: PromptSpec;
  metadata: {
    quality_score: number;
    validation: {
      is_valid: boolean;
      issues: string[];
      attempts: number;
      auto_fixed: boolean;
    };
    performance: {
      generation_time: number;
      iterations: number;
      backend_used: string;
    };
    ai_backend: AiBackend;
    fallback: {
      used: boolean;
      reason?: string;
    };
  };
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]/g, '_')
    .toLowerCase()
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
}

function generateFieldDescription(fieldName: string, context?: string): string {
  const snakeName = toSnakeCase(fieldName);
  const descriptions: Record<string, string> = {
    'code_snippet': 'The code snippet or program to be processed',
    'language': 'Programming language of the code',
    'component_name': 'Name of the UI component',
    'props': 'Component properties and configuration',
    'endpoint': 'API endpoint URL',
    'method': 'HTTP method (GET, POST, etc.)',
    'payload': 'Request payload or parameters',
    'data_source': 'Source of the data to process',
    'query': 'Query or operation to perform',
    'results': 'Query results or processed data',
    'content': 'Text content to process or generate',
    'parameters': 'Processing parameters and options',
    'response': 'The processed response or result',
    'status': 'Status of the processing operation',
    'analysis': 'Detailed analysis of the input',
    'summary': 'Concise summary of the results',
    'issues': 'Identified issues or problems',
    'suggestions': 'Improvement suggestions',
    'metadata': 'Additional information about the process',
    'user_input': 'Primary user input for processing',
    'generated_content': 'Generated content or result',
    'processed_content': 'Processed or generated text content',
    'ui_structure': 'UI component structure and layout',
    'styles': 'CSS styles and theming',
    'behavior': 'Component behavior and interactions',
    'response_schema': 'Expected response structure',
    'status_codes': 'Possible HTTP status codes and meanings'
  };

  return descriptions[snakeName] || `The ${snakeName.replace(/_/g, ' ')} for this operation`;
}

function normalizeFieldName(name: string): string {
  const normalized = toSnakeCase(name);

  // Avoid generic names
  const genericNames = ['data', 'result', 'output', 'input', 'value', 'item'];
  if (genericNames.includes(normalized)) {
    return `${normalized}_content`;
  }

  return normalized;
}

function normalizeFieldType(type: string): string {
  const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
  return validTypes.includes(type.toLowerCase()) ? type.toLowerCase() : 'string';
}

function normalizeInputFields(fields: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};

  Object.entries(fields).forEach(([key, field]) => {
    const normalizedKey = normalizeFieldName(key);
    const normalizedField: any = {
      type: normalizeFieldType(field?.type || 'string'),
      description: field?.description || generateFieldDescription(normalizedKey)
    };
    normalized[normalizedKey] = normalizedField;
  });

  return normalized;
}

function normalizeOutputFields(fields: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};

  Object.entries(fields).forEach(([key, field]) => {
    const normalizedKey = normalizeFieldName(key);
    const type = normalizeFieldType(field?.type || 'string');

    // Ensure structured outputs
    let normalizedField: any;
    if (type === 'string' && !['summary', 'status', 'message'].includes(normalizedKey)) {
      // Convert simple strings to structured objects when appropriate
      normalizedField = {
        type: 'object',
        description: field?.description || generateFieldDescription(normalizedKey),
        properties: {
          content: {
            type: 'string',
            description: 'The main content of this output'
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata for this output'
          }
        }
      };
    } else {
      normalizedField = {
        type,
        description: field?.description || generateFieldDescription(normalizedKey)
      };
    }

    normalized[normalizedKey] = normalizedField;
  });

  // Ensure at least one structured output
  const hasStructured = Object.values(normalized).some((field: any) => field.type === 'object' || field.type === 'array');
  if (!hasStructured) {
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

function normalizeTaskInstruction(instruction: string): string {
  // Ensure it's specific and actionable
  if (instruction.length < 20 || instruction.toLowerCase().includes('generate something')) {
    return `Process and provide structured results for: ${instruction}`;
  }
  return instruction;
}

function normalizeSpec(spec: PromptSpec, qualityScore: number, validation: any, performance: any, aiBackend: AiBackend, fallback: any): NormalizedSpec {
  const normalizedPromptSpec: PromptSpec = {
    task_instruction: normalizeTaskInstruction(spec.task_instruction),
    input_fields: normalizeInputFields(spec.input_fields),
    output_fields: normalizeOutputFields(spec.output_fields)
  };

  const normalizedSpec: NormalizedSpec = {
    prompt_spec: normalizedPromptSpec,
    metadata: {
      quality_score: qualityScore,
      validation: validation,
      performance: performance,
      ai_backend: aiBackend,
      fallback: fallback
    }
  };

  return normalizedSpec;
}

function validateConsistency(spec: NormalizedSpec): { isConsistent: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check required top-level structure
  if (!spec.prompt_spec) issues.push('Missing prompt_spec');
  if (!spec.metadata) issues.push('Missing metadata');

  // Check prompt_spec structure
  if (spec.prompt_spec) {
    if (!spec.prompt_spec.task_instruction) issues.push('Missing task_instruction');
    if (!spec.prompt_spec.input_fields) issues.push('Missing input_fields');
    if (!spec.prompt_spec.output_fields) issues.push('Missing output_fields');
  }

  // Check metadata structure
  if (spec.metadata) {
    const requiredMetaKeys = ['quality_score', 'validation', 'performance', 'ai_backend', 'fallback'];
    requiredMetaKeys.forEach(key => {
      if (!(key in spec.metadata)) issues.push(`Missing metadata.${key}`);
    });
  }

  return { isConsistent: issues.length === 0, issues };
}

const SYSTEM_INSTRUCTION = `You are a prompt engineering assistant. Convert raw user text into a complete, structured, and non-generic JSON Prompt Specification.

CRITICAL: You MUST return ONLY valid JSON. No text before or after the JSON. No explanations. No markdown.

REQUIRED JSON STRUCTURE:
{
  "task_instruction": "Detailed, specific instruction (not generic)",
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

MANDATORY RULES:
- input_fields must NOT be empty
- output_fields must NOT be empty
- Each field must have "type" and "description"
- No generic fields like "result" or "output"
- task_instruction must be specific and actionable
- Return ONLY the JSON object, nothing else`;

const IMPROVEMENT_INSTRUCTION = `You are a prompt engineering assistant. Fix the following invalid Prompt Specification to make it complete, structured, and valid.

PROBLEMS TO FIX:
- Empty input_fields or output_fields
- Missing type or description in fields
- Generic fields like "result"
- Vague task_instruction

REQUIRED OUTPUT FORMAT:
Return ONLY this JSON structure:
{
  "prompt_spec": {
    "task_instruction": "Detailed specific instruction",
    "input_fields": {
      "field_name": {
        "type": "string",
        "description": "Clear description"
      }
    },
    "output_fields": {
      "field_name": {
        "type": "string",
        "description": "Clear description"
      }
    }
  },
  "improvements_applied": "Brief description of what was fixed"
}

MANDATORY: Return ONLY the JSON object, no explanations or text outside JSON.`;

function getAvailableOllamaModels(): string[] {
  try {
    const output = execSync('ollama list', { encoding: 'utf8' });
    // Parse output: skip header, extract first column (NAME)
    const lines = output.trim().split('\n').slice(1);
    return lines.map(line => line.trim().split(/\s+/)[0]).filter(Boolean);
  } catch (error) {
    console.warn('Failed to retrieve Ollama models list:', error instanceof Error ? error.message : error);
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
    console.debug('Ollama model validation: exact match', { configuredModel, resolvedModel: configuredModel, status: 'valid' });
    return { resolvedModel: configuredModel, status: 'valid', availableModels };
  }

  // Partial match (starts with or contains)
  const partialMatch = availableModels.find(model =>
    model.toLowerCase().startsWith(normalizedConfigured) ||
    model.toLowerCase().includes(normalizedConfigured)
  );
  if (partialMatch) {
    console.debug('Ollama model validation: partial match corrected', { configuredModel, resolvedModel: partialMatch, status: 'corrected' });
    return { resolvedModel: partialMatch, status: 'corrected', availableModels };
  }

  // If no tag provided, try appending :latest
  if (!configuredModel.includes(':')) {
    const withLatest = `${configuredModel}:latest`;
    if (availableModels.includes(withLatest)) {
      console.debug('Ollama model validation: appended :latest', { configuredModel, resolvedModel: withLatest, status: 'corrected' });
      return { resolvedModel: withLatest, status: 'corrected', availableModels };
    }
  }

  // Fallback to first available model
  const fallbackModel = availableModels[0];
  console.warn('Ollama model validation: no match found, using fallback', { configuredModel, resolvedModel: fallbackModel, status: 'fallback', availableModels });
  return { resolvedModel: fallbackModel, status: 'fallback', availableModels };
}

function extractJsonObject(rawText: string): string {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Unable to extract JSON object from OpenAI response.");
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
};

function selectBackend(preferredBackend: string = "auto"): { client: any; backend: AiBackend } {
  const normalizedPreference = (preferredBackend || "auto").toLowerCase();
  const ollamaAvailable = Boolean(ollamaClient);
  const openAiAvailable = Boolean(openAiClient);

  if (normalizedPreference === "ollama" && ollamaAvailable) {
    try {
      const { resolvedModel } = resolveOllamaModel(OLLAMA_MODEL);
      return {
        client: ollamaClient,
        backend: { provider: "ollama", model: resolvedModel, fallback_used: false }
      };
    } catch (error) {
      console.warn('Ollama model validation failed, falling back to OpenAI if available:', error instanceof Error ? error.message : error);
      if (openAiAvailable) {
        return {
          client: openAiClient,
          backend: { provider: "openai", model: MODEL_NAME, fallback_used: true }
        };
      }
      throw new Error("Ollama selected but model validation failed, and no OpenAI available.");
    }
  }

  if (normalizedPreference === "openai" && openAiAvailable) {
    return {
      client: openAiClient,
      backend: { provider: "openai", model: MODEL_NAME, fallback_used: false }
    };
  }

  if (normalizedPreference === "auto") {
    if (ollamaAvailable) {
      try {
        const { resolvedModel } = resolveOllamaModel(OLLAMA_MODEL);
        return {
          client: ollamaClient,
          backend: { provider: "ollama", model: resolvedModel, fallback_used: false }
        };
      } catch (error) {
        console.warn('Ollama model validation failed, trying OpenAI:', error instanceof Error ? error.message : error);
      }
    }
    if (openAiAvailable) {
      return {
        client: openAiClient,
        backend: { provider: "openai", model: MODEL_NAME, fallback_used: false }
      };
    }
  }

  if (ollamaAvailable) {
    try {
      const { resolvedModel } = resolveOllamaModel(OLLAMA_MODEL);
      return {
        client: ollamaClient,
        backend: { provider: "ollama", model: resolvedModel, fallback_used: false }
      };
    } catch (error) {
      console.warn('Ollama model validation failed:', error instanceof Error ? error.message : error);
    }
  }

  if (openAiAvailable) {
    return {
      client: openAiClient,
      backend: { provider: "openai", model: MODEL_NAME, fallback_used: false }
    };
  }

  throw new Error("No AI backend configured. Please set OPENAI_API_KEY or enable Ollama.");
}

async function createCompletion(messages: Array<{ role: "system" | "user"; content: string }>, client: any): Promise<CompletionResult> {
  if (!client) {
    throw new Error("No AI client available for completion.");
  }

  if (client === ollamaClient) {
    // Use Ollama
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

  if (client === openAiClient) {
    // Use OpenAI
    if (!openAiClient) {
      throw new Error("OpenAI client not available.");
    }
    const completion = await openAiClient.chat.completions.create({
      model: MODEL_NAME,
      messages,
      temperature: 0.2,
      max_tokens: 900,
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty completion.");
    }

    const tokens = completion.usage?.total_tokens ?? 0;
    const model = typeof completion.model === "string" ? completion.model : MODEL_NAME;

    return { content, tokens, model };
  }

  throw new Error("Unsupported AI client.");
}

export async function promptToSpec(prompt: string, context?: string, preferredBackend: string = "auto", strictJson: boolean = false): Promise<CompletionResult & { spec: NormalizedSpec; ai_backend: AiBackend; json_validation: { is_valid: boolean; attempts: number; auto_fixed: boolean } }> {
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

    const inputFields: Record<string, unknown> = {};

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

    const outputFields: Record<string, unknown> = {};

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

  const { client, backend } = selectBackend(preferredBackend);

  let lastError = "";
  let rawAiResponse = "";
  let parsedSpec: unknown = null;
  let jsonValidation = { is_valid: false, attempts: 0, auto_fixed: false };

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const completion = await createCompletion([
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: createUserPrompt(attempt, [lastError]).trim() },
      ], client);

      rawAiResponse = completion.content;
      console.debug("AI response", {
        attempt,
        ai_response: rawAiResponse,
        backend: backend.provider,
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

      const validationResult = validateSpec(parsedSpec);
      if (validationResult.valid) {
        // Apply learning improvements
        const baseSpec = parsedSpec as PromptSpec;
        const { improvedSpec, improvements } = improveWithLearning(baseSpec, prompt);

        // Enforce quality standards
        const { spec: finalSpec, qualityScore, appliedFixes } = enforceQualityStandards(improvedSpec, prompt);

        // Check quality threshold
        if (qualityScore < 8) {
          console.warn(`Spec quality too low (${qualityScore}), rejecting and retrying`);
          lastError = `Quality score ${qualityScore} below threshold 8. Applied fixes: ${appliedFixes.join(", ")}`;
          continue; // Retry
        }

        // Store in history
        addToHistory({
          prompt,
          generated_spec: finalSpec,
          quality_score: qualityScore,
          feedback_score: 0, // Will be updated later if feedback provided
          iterations: attempt,
          backend_used: backend.provider
        });

        console.debug("Prompt spec generated and improved with learning", {
          prompt,
          preferredBackend,
          strictJson,
          retryCount: attempt,
          improvements_applied: improvements,
          quality_score: qualityScore,
          quality_fixes: appliedFixes,
          final_spec: finalSpec,
        });

        return {
          ...completion,
          spec: normalizeSpec(finalSpec),
          ai_backend: backend,
          json_validation: jsonValidation
        };
      }

      // If validation failed and we have attempts left, continue to next attempt
      if (!validationResult.valid && attempt < MAX_GENERATION_ATTEMPTS) {
        console.debug(`Attempt ${attempt} validation failed, will retry.`, validationResult.issues);
        continue;
      }

      // If validation passed, use this spec
      if (validationResult.valid) {
        // Apply learning improvements
        const baseSpec = parsedSpec as PromptSpec;
        const { improvedSpec, improvements } = improveWithLearning(baseSpec, prompt);

        // Enforce quality standards
        const { spec: finalSpec, qualityScore, appliedFixes } = enforceQualityStandards(improvedSpec, prompt);

        // Store in history
        addToHistory({
          prompt,
          generated_spec: finalSpec,
          quality_score: qualityScore,
          feedback_score: 0,
          timestamp: new Date().toISOString(),
          iterations: attempt,
          backend_used: backend.provider
        });

        return {
          ...completion,
          spec: normalizeSpec(finalSpec),
          ai_backend: backend,
          json_validation: jsonValidation
        };
      }

      // Validation failed and no more attempts
      lastError = `Validation failed: ${validationResult.issues.join("; ")}`;
      console.warn(`Attempt ${attempt} failed validation.`, lastError);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`Attempt ${attempt} failed to produce a valid spec.`, lastError);
    }
  }

  // Fast deterministic fallback - no AI calls, no complex processing
  const fallbackSpec: PromptSpec = {
    task_instruction: "Process user requests with structured input and output",
    input_fields: {
      user_input: {
        type: "string",
        description: "The user's input data or request"
      }
    },
    output_fields: {
      result: {
        type: "string",
        description: "The processed result or response"
      }
    }
  };

  // Apply learning to fallback
  const { improvedSpec: learnedFallbackSpec, improvements: learningImprovements } = improveWithLearning(fallbackSpec, prompt);

  // Enforce quality standards on fallback
  const { spec: qualityEnforcedFallback, qualityScore, appliedFixes } = enforceQualityStandards(learnedFallbackSpec, prompt);

  console.warn("Falling back to context-aware prompt spec after retries.", {
    prompt,
    preferredBackend,
    strictJson,
    retryCount: MAX_GENERATION_ATTEMPTS,
    lastError,
    fallback_spec: qualityEnforcedFallback,
    learning_improvements: learningImprovements,
    quality_fixes: appliedFixes,
  });

  // Store fallback in history
  addToHistory({
    prompt,
    generated_spec: qualityEnforcedFallback,
    quality_score: qualityScore,
    feedback_score: 0,
    iterations: MAX_GENERATION_ATTEMPTS,
    backend_used: 'fallback'
  });

  // Final safety net: ensure fallback is valid
  const fallbackValidation = validateSpec(qualityEnforcedFallback);
  if (!fallbackValidation.valid) {
    console.error("Quality enforced fallback spec failed validation, using hardcoded valid spec.", fallbackValidation.issues);
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
      spec: hardcodedSpec,
      ai_backend: { provider: "fallback", model: "fallback", fallback_used: true },
      json_validation: { is_valid: true, attempts: 1, auto_fixed: false }
    };
  }

  return {
    content: JSON.stringify(qualityEnforcedFallback),
    tokens: 0,
    model: "fallback",
    spec: normalizeSpec(qualityEnforcedFallback),
    ai_backend: { provider: "fallback", model: "fallback", fallback_used: true },
    json_validation: { is_valid: true, attempts: 1, auto_fixed: false }
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

type OpenAIImprovementResult = {
  prompt_spec: PromptSpec;
  improvements_applied: string;
};

export async function improveSpec(spec: unknown, issues: string[] = [], context?: string, preferredBackend: "ollama" | "openai" | "auto" = "auto", strictJson: boolean = false): Promise<OpenAIImprovementResult & CompletionResult & { ai_backend: AiBackend; json_validation: { is_valid: boolean; attempts: number; auto_fixed: boolean } }> {
  const { client, backend } = selectBackend(preferredBackend);

  if (!client) {
    throw new Error("No AI backend configured for improvements. Please set OPENAI_API_KEY or enable Ollama.");
  }

  const safeSpec = typeof spec === "string" ? { raw_spec: spec } : spec;
  const problemSummary = issues.length > 0 ? issues.join("\n") : "No explicit validation issues were provided.";

  let completion: CompletionResult;

  try {
    completion = await createCompletion([
      { role: "system", content: IMPROVEMENT_INSTRUCTION },
      {
        role: "user",
        content: `Current spec: ${JSON.stringify(safeSpec, null, 2)}\n\nValidation issues:\n${problemSummary}`,
      },
    ], client);
  } catch (error) {
    console.warn("AI improvement call failed, using valid fallback improvement.", error instanceof Error ? error.message : error);
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
  let parsed: OpenAIImprovementResult;
  let jsonValidation: { is_valid: boolean; attempts: number; auto_fixed: boolean };

  if (strictJson) {
    const jsonResult = parseJsonWithRetry<OpenAIImprovementResult>(completion.content, true);
    parsed = jsonResult.parsed;
    jsonValidation = {
      is_valid: true,
      attempts: jsonResult.attempts,
      auto_fixed: jsonResult.autoFixed
    };
  } else {
    parsed = parseJson<OpenAIImprovementResult>(completion.content);
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
  // Ensure it's a valid identifier and not too generic
  if (snakeCase.length < 3) return `field_${snakeCase}`;
  if (['result', 'output', 'data', 'value', 'response'].includes(snakeCase)) {
    return `${snakeCase}_data`;
  }
  return snakeCase;
}

export function normalizeInputFields(fields: Record<string, any>): Record<string, { type: string; description: string }> {
  const normalized: Record<string, { type: string; description: string }> = {};

  for (const [key, value] of Object.entries(fields)) {
    const normalizedKey = normalizeFieldName(key);
    const type = typeof value.type === 'string' ? value.type : 'string';
    const description = typeof value.description === 'string' ? value.description : `Input field: ${normalizedKey}`;

    normalized[normalizedKey] = {
      type: type.toLowerCase(),
      description: description.trim()
    };
  }

  return normalized;
}

export function normalizeOutputFields(fields: Record<string, any>): Record<string, { type: string; description: string }> {
  const normalized: Record<string, { type: string; description: string }> = {};

  for (const [key, value] of Object.entries(fields)) {
    const normalizedKey = normalizeFieldName(key);
    const type = typeof value.type === 'string' ? value.type : 'string';
    const description = typeof value.description === 'string' ? value.description : `Output field: ${normalizedKey}`;

    normalized[normalizedKey] = {
      type: type.toLowerCase(),
      description: description.trim()
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
  metadata: {
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
