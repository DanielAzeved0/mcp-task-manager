/**
 * Test Suite for Prompt Specification Enhancements
 * 
 * Tests validate the new enrichment, anti-pattern detection, and quality
 * scoring mechanisms in the prompt specification generation system.
 */

const assert = require('assert');

/**
 * Mock implementations for testing (would be imported from promptSpecService.ts)
 */

// Test data for validation
const testCases = [
  {
    name: "Code Analysis Domain Detection",
    prompt: "Analyze this Python code for bugs and security issues",
    expectedDomain: "code_analysis",
    expectedOutputFields: ["issues", "summary", "recommendations"],
    validate: (spec) => {
      assert(spec.output_fields.issues, "Should have 'issues' field");
      assert(spec.output_fields.issues.type === "array", "Issues should be array");
      assert(spec.output_fields.issues.items.properties.severity, "Issues should have severity");
      assert(spec.output_fields.issues.items.properties.fix, "Issues should have fix");
    }
  },

  {
    name: "Data Processing Template Application",
    prompt: "Process database records and return statistics",
    expectedDomain: "data_processing",
    expectedOutputFields: ["results", "metadata", "statistics"],
    validate: (spec) => {
      assert(spec.output_fields.results, "Should have 'results' field");
      assert(spec.output_fields.results.type === "array", "Results should be array");
      assert(spec.output_fields.statistics, "Should have 'statistics' field");
      assert(spec.output_fields.metadata.properties.total_records, "Metadata should have total_records");
    }
  },

  {
    name: "API Specification Generation",
    prompt: "Design REST API endpoints for user management",
    expectedDomain: "api_specification",
    expectedOutputFields: ["endpoints", "common_responses"],
    validate: (spec) => {
      assert(spec.output_fields.endpoints, "Should have 'endpoints' field");
      assert(spec.output_fields.endpoints.type === "array", "Endpoints should be array");
      assert(spec.output_fields.endpoints.items.properties.method, "Endpoints should have method");
      assert(spec.output_fields.endpoints.items.properties.response_schema, "Endpoints should have response_schema");
    }
  },

  {
    name: "UI Component Specification",
    prompt: "Design a React component for user authentication",
    expectedDomain: "ui_component",
    expectedOutputFields: ["component", "structure", "styling", "accessibility"],
    validate: (spec) => {
      assert(spec.output_fields.component, "Should have 'component' field");
      assert(spec.output_fields.accessibility, "Should have 'accessibility' field");
      assert(spec.output_fields.accessibility.properties.wcag_level, "Should specify WCAG level");
    }
  },

  {
    name: "Content Generation",
    prompt: "Write a comprehensive article about machine learning",
    expectedDomain: "content_generation",
    expectedOutputFields: ["content", "sections", "analysis", "metadata"],
    validate: (spec) => {
      assert(spec.output_fields.sections, "Should have 'sections' field");
      assert(spec.output_fields.analysis, "Should have 'analysis' field");
      assert(spec.output_fields.analysis.properties.key_topics, "Analysis should have key_topics");
      assert(spec.output_fields.analysis.properties.sentiment, "Analysis should have sentiment");
    }
  }
];

// Anti-pattern detection tests
const antiPatternTests = [
  {
    name: "Empty Output Fields Detection",
    spec: {
      task_instruction: "Process something",
      input_fields: { input: { type: "string" } },
      output_fields: {}
    },
    expectedAntiPatterns: ["empty_output_fields"],
    expectedSeverity: "critical"
  },

  {
    name: "Single Generic Output Detection",
    spec: {
      task_instruction: "Do something",
      input_fields: { input: { type: "string" } },
      output_fields: {
        result: { type: "string", description: "The result" }
      }
    },
    expectedAntiPatterns: ["single_generic_output"],
    expectedSeverity: "critical"
  },

  {
    name: "Non-Structured Output Detection",
    spec: {
      task_instruction: "Process data",
      input_fields: { input: { type: "string" } },
      output_fields: {
        response: { type: "string", description: "Response" }
      }
    },
    expectedAntiPatterns: ["non_structured_output"],
    expectedSeverity: "high"
  },

  {
    name: "Incomplete Object Structure",
    spec: {
      task_instruction: "Return data",
      input_fields: { input: { type: "string" } },
      output_fields: {
        data: { type: "object", description: "Data output" }
        // Missing properties
      }
    },
    expectedAntiPatterns: ["incomplete_structure_data"],
    expectedSeverity: "medium"
  },

  {
    name: "Vague Task Instruction",
    spec: {
      task_instruction: "Do it",
      input_fields: { input: { type: "string" } },
      output_fields: {
        results: {
          type: "array",
          items: { type: "object" }
        }
      }
    },
    expectedAntiPatterns: ["vague_task_instruction"],
    expectedSeverity: "high"
  }
];

// Quality score tests
const qualityScoreTests = [
  {
    name: "Low Quality - Single Generic Output",
    spec: {
      task_instruction: "Process",
      input_fields: { input: { type: "string" } },
      output_fields: { result: { type: "string" } }
    },
    expectedScoreRange: [2, 4]
  },

  {
    name: "Medium Quality - Basic Structure",
    spec: {
      task_instruction: "Process data and return results",
      input_fields: { input: { type: "string" } },
      output_fields: {
        results: { type: "array", items: { type: "object" } },
        status: { type: "string" }
      }
    },
    expectedScoreRange: [6, 7]
  },

  {
    name: "High Quality - Well-Structured",
    spec: {
      task_instruction: "Process data and return detailed, structured results",
      input_fields: {
        data: { type: "string" },
        options: { type: "object" }
      },
      output_fields: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              data: { type: "object" },
              metrics: { type: "object" }
            }
          }
        },
        metadata: {
          type: "object",
          properties: {
            total: { type: "number" },
            processed: { type: "number" }
          }
        }
      }
    },
    expectedScoreRange: [8, 10]
  },

  {
    name: "Perfect Quality - Domain-Enriched",
    spec: {
      task_instruction: "Provide detailed code analysis with specific fixes and recommendations",
      input_fields: {
        code: { type: "string" },
        language: { type: "string" }
      },
      output_fields: {
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              severity: { type: "string" },
              line: { type: "number" },
              description: { type: "string" },
              fix: { type: "string" }
            }
          }
        },
        summary: {
          type: "object",
          properties: {
            total: { type: "number" },
            critical: { type: "number" },
            quality_score: { type: "number" }
          }
        }
      }
    },
    expectedScoreRange: [9, 10]
  }
];

// Field enrichment tests
const enrichmentTests = [
  {
    name: "Code Analysis Field Enrichment",
    originalFields: { errors: { type: "array" } },
    domain: "code_analysis",
    validate: (enriched) => {
      assert(enriched.issues, "Should add 'issues' field");
      assert(enriched.summary, "Should add 'summary' field");
      assert(enriched.recommendations, "Should add 'recommendations' field");
      assert(enriched.issues.items.properties.fix, "Issues should have fix property");
    }
  },

  {
    name: "Data Processing Field Enrichment",
    originalFields: { output: { type: "array" } },
    domain: "data_processing",
    validate: (enriched) => {
      assert(enriched.results, "Should add 'results' field");
      assert(enriched.metadata, "Should have 'metadata' field");
      assert(enriched.statistics, "Should have 'statistics' field");
      assert(enriched.metadata.properties.execution_time_ms, "Should have execution_time_ms");
    }
  }
];

// Output structure validation
const structureValidationTests = [
  {
    name: "Array with Item Schema",
    field: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          data: { type: "object" }
        }
      }
    },
    isValid: true
  },

  {
    name: "Object with Properties",
    field: {
      type: "object",
      properties: {
        count: { type: "number" },
        details: { type: "object" }
      }
    },
    isValid: true
  },

  {
    name: "Incomplete Array (Missing Items)",
    field: {
      type: "array"
      // Missing items definition
    },
    isValid: false
  },

  {
    name: "Incomplete Object (Missing Properties)",
    field: {
      type: "object"
      // Missing properties
    },
    isValid: false
  }
];

/**
 * Test Execution Summary
 */
const testSummary = {
  totalTestCases: 
    testCases.length +
    antiPatternTests.length +
    qualityScoreTests.length +
    enrichmentTests.length +
    structureValidationTests.length,

  categories: {
    domainDetection: testCases.length,
    antiPatternDetection: antiPatternTests.length,
    qualityScoring: qualityScoreTests.length,
    fieldEnrichment: enrichmentTests.length,
    structureValidation: structureValidationTests.length
  },

  expectedOutcomes: {
    "Domain Detection": "✅ All prompts correctly map to domains",
    "Anti-Pattern Detection": "✅ All anti-patterns identified with correct severity",
    "Quality Scoring": "✅ Scores reflect specification quality accurately",
    "Field Enrichment": "✅ Domain-specific fields added correctly",
    "Structure Validation": "✅ Invalid structures identified, valid ones accepted"
  },

  successCriteria: [
    "Domain detection accuracy > 95%",
    "Anti-pattern detection accuracy = 100%",
    "Quality score correlation with spec quality > 0.9",
    "All enrichments add meaningful, domain-specific fields",
    "No false positives in structure validation"
  ],

  performanceMetrics: {
    domainDetection: "< 5ms",
    antiPatternDetection: "< 10ms",
    fieldEnrichment: "< 15ms",
    qualityScoring: "< 8ms",
    totalProcessing: "< 40ms"
  }
};

module.exports = {
  testCases,
  antiPatternTests,
  qualityScoreTests,
  enrichmentTests,
  structureValidationTests,
  testSummary
};

/**
 * TEST EXECUTION NOTES
 * 
 * To run these tests:
 * 
 * 1. Import the enhanced promptSpecService.ts functions
 * 2. Run each test case through the system
 * 3. Validate outputs against expected patterns
 * 4. Compare quality scores with expected ranges
 * 5. Verify anti-pattern detection accuracy
 * 
 * Expected Results:
 * - All domain detection tests should pass with correct template application
 * - All anti-pattern tests should identify issues with correct severity
 * - All quality score tests should fall within expected ranges
 * - All enrichment tests should add domain-specific fields
 * - All structure validation should correctly validate/reject
 */
