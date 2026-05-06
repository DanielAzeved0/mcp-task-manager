/**
 * Enhanced Prompt Specification Examples
 * 
 * This file demonstrates the improvements made to the prompt specification
 * generation system with rich, structured, domain-aware outputs.
 */

// ============================================================================
// EXAMPLE 1: Code Analysis - Before & After
// ============================================================================

const codeAnalysisExample = {
  prompt: "Analyze this code for bugs and optimization opportunities",
  
  before: {
    task_instruction: "Analyze code",
    input_fields: {
      code: { type: "string", description: "Code to analyze" }
    },
    output_fields: {
      result: { type: "string", description: "Analysis result" }
    },
    quality_score: 3
  },

  after: {
    task_instruction: "Provide detailed, structured analysis of code for bugs, performance issues, and security vulnerabilities with specific fixes and optimization recommendations",
    input_fields: {
      code_snippet: { type: "string", description: "The code snippet or program to be processed" },
      language: { type: "string", description: "Programming language of the code" }
    },
    output_fields: {
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
    },
    quality_score: 9
  },

  improvements: [
    "✅ Replaced single generic 'result' with multiple structured outputs",
    "✅ Added domain-specific fields: type, severity, line, column, fix, category",
    "✅ Structured issue array with detailed nested properties",
    "✅ Added summary statistics (total_issues, quality_score)",
    "✅ Added recommendations with priority and impact",
    "✅ Enhanced task instruction with specific requirements",
    "✅ Quality score improved: 3 → 9"
  ]
};

// ============================================================================
// EXAMPLE 2: Data Processing - Before & After
// ============================================================================

const dataProcessingExample = {
  prompt: "Process user data and return analytics",
  
  before: {
    task_instruction: "Process data",
    input_fields: {
      data: { type: "object", description: "Input data" }
    },
    output_fields: {
      output: { type: "string", description: "Processing output" }
    },
    quality_score: 2
  },

  after: {
    task_instruction: "Process and analyze user data with comprehensive statistics, quality metrics, and detailed record information",
    input_fields: {
      data_source: { type: "string", description: "Source of the data to process" },
      query: { type: "string", description: "Query or operation to perform" },
      filters: { type: "object", description: "Optional filtering criteria" }
    },
    output_fields: {
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
    },
    quality_score: 10
  },

  improvements: [
    "✅ Added second input field (query) for specificity",
    "✅ Replaced generic 'output' string with structured array of records",
    "✅ Added detailed record structure with id, data, metrics, status",
    "✅ Added comprehensive metadata (total, processed, failed, execution_time)",
    "✅ Added statistics object with min, max, average, percentiles",
    "✅ All outputs are immediately consumable by analytics tools",
    "✅ Quality score improved: 2 → 10 (perfect score)"
  ]
};

// ============================================================================
// EXAMPLE 3: API Specification - Before & After
// ============================================================================

const apiSpecExample = {
  prompt: "Generate REST API specification",
  
  before: {
    task_instruction: "Generate API specification",
    input_fields: {
      api_description: { type: "string", description: "API description" }
    },
    output_fields: {
      spec: { type: "object", description: "API specification" }
    },
    quality_score: 4
  },

  after: {
    task_instruction: "Generate comprehensive REST API specification with detailed endpoint definitions, request/response schemas, authentication requirements, and rate limiting policies",
    input_fields: {
      api_description: { type: "string", description: "Detailed description of the API" },
      base_path: { type: "string", description: "Base path for all endpoints" },
      authentication_type: { type: "string", description: "Authentication mechanism (OAuth, JWT, API Key, etc.)" },
      version: { type: "string", description: "API version" }
    },
    output_fields: {
      endpoints: {
        type: "array",
        description: "List of API endpoints with full specifications",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "API endpoint path" },
            method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
            description: { type: "string" },
            parameters: { type: "object", description: "Query/path parameters" },
            request_body: { type: "object", description: "Request body schema" },
            response_schema: { type: "object", description: "Expected response structure" },
            status_codes: { type: "object", description: "Possible HTTP status codes" },
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
      },
      security_schemes: {
        type: "object",
        description: "Security schemes and authentication methods"
      }
    },
    quality_score: 9
  },

  improvements: [
    "✅ Added 3 additional input fields for full API context",
    "✅ Replaced generic 'spec' object with structured endpoints array",
    "✅ Each endpoint has full details: path, method, parameters, schemas",
    "✅ Added common_responses for consistency patterns",
    "✅ Added security_schemes for authentication details",
    "✅ All outputs are OpenAPI compatible",
    "✅ Quality score improved: 4 → 9"
  ]
};

// ============================================================================
// EXAMPLE 4: Anti-Pattern Detection
// ============================================================================

const antiPatternDetectionExamples = {
  "empty_output_fields": {
    before: {
      output_fields: {}
    },
    detected: "empty_output_fields",
    severity: "critical",
    fix: "Apply domain template or create structured defaults",
    after: {
      output_fields: {
        structured_result: {
          type: "object",
          properties: {
            data: { type: "object" },
            metadata: { type: "object" }
          }
        }
      }
    }
  },

  "single_generic_output": {
    before: {
      output_fields: {
        result: { type: "string", description: "The result" }
      }
    },
    detected: "single_generic_output",
    severity: "critical",
    fix: "Replace with domain-specific template",
    after: {
      output_fields: {
        issues: { type: "array", items: { /* ... */ } },
        summary: { type: "object", properties: { /* ... */ } },
        recommendations: { type: "array", items: { /* ... */ } }
      }
    }
  },

  "non_structured_output": {
    before: {
      output_fields: {
        response: { type: "string", description: "Response" }
      }
    },
    detected: "non_structured_output",
    severity: "high",
    fix: "Convert simple strings to structured objects",
    after: {
      output_fields: {
        response: {
          type: "object",
          properties: {
            data: { type: "object" },
            metadata: { type: "object" }
          }
        },
        status: { type: "string" }
      }
    }
  },

  "incomplete_structure": {
    before: {
      output_fields: {
        items: { type: "array" } // Missing items schema
      }
    },
    detected: "incomplete_structure_items",
    severity: "medium",
    fix: "Add nested properties/items definition",
    after: {
      output_fields: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              data: { type: "object" }
            }
          }
        }
      }
    }
  }
};

// ============================================================================
// EXAMPLE 5: Domain Detection in Action
// ============================================================================

const domainDetectionExamples = [
  {
    prompt: "Review this React component for accessibility and performance",
    detectedDomain: "ui_component",
    appliedTemplate: "component_specification",
    outputFields: ["component", "structure", "styling", "accessibility"]
  },
  {
    prompt: "Query the database and analyze user engagement metrics",
    detectedDomain: "data_processing",
    appliedTemplate: "data_results",
    outputFields: ["results", "metadata", "statistics"]
  },
  {
    prompt: "Check this Python code for security vulnerabilities",
    detectedDomain: "code_analysis",
    appliedTemplate: "code_issues",
    outputFields: ["issues", "summary", "recommendations"]
  },
  {
    prompt: "Generate a blog post about AI",
    detectedDomain: "content_generation",
    appliedTemplate: "generated_content",
    outputFields: ["content", "sections", "analysis", "metadata"]
  },
  {
    prompt: "Design REST endpoints for user management",
    detectedDomain: "api_specification",
    appliedTemplate: "api_specification",
    outputFields: ["endpoints", "common_responses"]
  }
];

// ============================================================================
// EXAMPLE 6: Quality Score Breakdown
// ============================================================================

const qualityScoreBreakdown = {
  baseScore: 10,
  deductions: {
    empty_input_fields: -3,
    empty_output_fields: -3,
    single_generic_output: -2,
    vague_task_instruction: -2,
    per_antipattern_high_severity: -1,
    per_antipattern_medium_severity: -0.5
  },
  bonuses: {
    has_structured_output: 2,
    has_domain_fields: 1,
    detailed_nested_properties_5plus: 2,
    detailed_nested_properties_3plus: 1
  },
  minimumScore: 5,
  productionReadyThreshold: 8,
  examples: [
    {
      spec: "Single string output with no structure",
      score: 3,
      issues: ["empty task_instruction", "single generic output", "no nested properties"]
    },
    {
      spec: "Structured array with 3 fields, basic task instruction",
      score: 6,
      issues: ["task_instruction could be more detailed"]
    },
    {
      spec: "Domain-enriched spec with multiple fields, detailed properties",
      score: 9,
      description: "Production-ready with excellent structure"
    },
    {
      spec: "Fully detailed domain-specific spec with comprehensive properties",
      score: 10,
      description: "Perfect specification"
    }
  ]
};

// ============================================================================
// EXPORT EXAMPLES
// ============================================================================

module.exports = {
  codeAnalysisExample,
  dataProcessingExample,
  apiSpecExample,
  antiPatternDetectionExamples,
  domainDetectionExamples,
  qualityScoreBreakdown
};
