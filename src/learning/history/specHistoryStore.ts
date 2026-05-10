import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { PromptSpec } from "../../schemas/promptSpec.js";
import { logEvent } from "../../observability/logger.js";

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

const HISTORY_FILE = join(process.cwd(), "promptSpecHistory.json");

let specHistory: SpecHistoryEntry[] = [];
let learningPatterns: LearningPatterns = createEmptyLearningPatterns();

function createEmptyLearningPatterns(): LearningPatterns {
  return {
    high_quality_input_patterns: {},
    high_quality_output_patterns: {},
    low_quality_patterns: [],
    domain_keywords: {},
  };
}

function saveHistory(): void {
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(specHistory, null, 2));
  } catch (error) {
    logEvent("warn", "learning_history_save_failed", { reason: error instanceof Error ? error.message : String(error) });
  }
}

function analyzePatterns(): void {
  const highQualitySpecs = specHistory.filter((entry) => entry.quality_score >= 7);
  const lowQualitySpecs = specHistory.filter((entry) => entry.quality_score < 5);

  learningPatterns = createEmptyLearningPatterns();

  highQualitySpecs.forEach((spec) => {
    Object.keys(spec.generated_spec.input_fields).forEach((field) => {
      const type = (spec.generated_spec.input_fields[field] as any)?.type;
      if (type) {
        const key = `${field}:${type}`;
        learningPatterns.high_quality_input_patterns[key] = (learningPatterns.high_quality_input_patterns[key] || 0) + 1;
      }
    });

    Object.keys(spec.generated_spec.output_fields).forEach((field) => {
      const type = (spec.generated_spec.output_fields[field] as any)?.type;
      if (type) {
        const key = `${field}:${type}`;
        learningPatterns.high_quality_output_patterns[key] = (learningPatterns.high_quality_output_patterns[key] || 0) + 1;
      }
    });

    const words = spec.prompt.toLowerCase().split(/\s+/);
    words.forEach((word) => {
      if (word.length > 3) {
        if (!learningPatterns.domain_keywords[word]) {
          learningPatterns.domain_keywords[word] = [];
        }
        Object.keys(spec.generated_spec.input_fields).forEach((field) => {
          if (!learningPatterns.domain_keywords[word].includes(field)) {
            learningPatterns.domain_keywords[word].push(field);
          }
        });
      }
    });
  });

  lowQualitySpecs.forEach((spec) => {
    if (Object.keys(spec.generated_spec.input_fields).length === 0) {
      learningPatterns.low_quality_patterns.push("empty_input_fields");
    }
    if (Object.keys(spec.generated_spec.output_fields).length === 0) {
      learningPatterns.low_quality_patterns.push("empty_output_fields");
    }
    if (Object.keys(spec.generated_spec.output_fields).includes("result")) {
      learningPatterns.low_quality_patterns.push("generic_result_output");
    }
  });
}

function loadHistory(): void {
  try {
    if (existsSync(HISTORY_FILE)) {
      const data = readFileSync(HISTORY_FILE, "utf8");
      specHistory = JSON.parse(data);
      analyzePatterns();
    }
  } catch (error) {
    logEvent("warn", "learning_history_load_failed", { reason: error instanceof Error ? error.message : String(error) });
    specHistory = [];
  }
}

export function getLearningPatterns(): LearningPatterns {
  return learningPatterns;
}

export function addToHistory(entry: Omit<SpecHistoryEntry, "id" | "timestamp">): void {
  const newEntry: SpecHistoryEntry = {
    ...entry,
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
  };
  specHistory.push(newEntry);

  if (specHistory.length > 1000) {
    specHistory = specHistory.slice(-1000);
  }

  saveHistory();
  analyzePatterns();
}

export function updateSpecFeedback(specId: string, feedbackScore: number): boolean {
  const entry = specHistory.find((item) => item.id === specId);
  if (entry) {
    entry.feedback_score = feedbackScore;
    saveHistory();
    analyzePatterns();
    return true;
  }
  return false;
}

export function getLearningStats(): { totalSpecs: number; averageQuality: number; topPatterns: Record<string, number> } {
  const total = specHistory.length;
  const averageQuality = total > 0 ? specHistory.reduce((sum, entry) => sum + entry.quality_score, 0) / total : 0;
  const topPatterns: Record<string, number> = {};

  Object.entries(learningPatterns.high_quality_input_patterns)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .forEach(([key, count]) => {
      topPatterns[key] = count;
    });

  return {
    totalSpecs: total,
    averageQuality: Math.round(averageQuality * 10) / 10,
    topPatterns,
  };
}

loadHistory();
