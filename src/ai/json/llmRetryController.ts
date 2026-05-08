import { logEvent, type TraceContext } from "../../observability/logger.js";
import { incrementMetric } from "../../observability/metrics.js";
import { repairJsonText } from "./jsonRepairEngine.js";
import { sanitizeJsonOutput } from "./jsonOutputSanitizer.js";
import { extractFirstValidJsonObject, JsonExtractionError } from "./strictJsonExtractor.js";

export type JsonStabilityErrorType = "malformed_json" | "truncated_output" | "schema_mismatch" | "empty_response";

export class JsonStabilityError extends Error {
  constructor(message: string, public readonly type: JsonStabilityErrorType) {
    super(message);
  }
}

export interface StableJsonParseResult<T> {
  parsed: T;
  attempts: number;
  autoFixed: boolean;
  errorType?: JsonStabilityErrorType;
}

function parseErrorType(error: unknown): JsonStabilityErrorType {
  if (error instanceof JsonExtractionError) return error.type;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("unexpected end")) return "truncated_output";
  if (message.includes("empty")) return "empty_response";
  if (message.includes("schema")) return "schema_mismatch";
  return "malformed_json";
}

export function parseStableJson<T>(
  rawText: string,
  options: {
    trace?: TraceContext;
    maxAutoFixAttempts?: number;
    validate?: (value: unknown) => { valid: boolean; issues: string[] };
  } = {},
): StableJsonParseResult<T> {
  const maxAutoFixAttempts = options.maxAutoFixAttempts ?? 2;
  const sanitized = sanitizeJsonOutput(rawText);
  if (sanitized.applied.length > 0) {
    logEvent("info", "json_sanitization_applied", { applied: sanitized.applied }, options.trace);
  }

  let extracted: string;
  try {
    const extraction = extractFirstValidJsonObject(sanitized.text);
    extracted = extraction.jsonText;
    logEvent("debug", "json_extraction_attempt", {
      stripped_prefix: extraction.strippedPrefix,
      stripped_suffix: extraction.strippedSuffix,
    }, options.trace);
  } catch (error) {
    const type = parseErrorType(error);
    incrementMetric("malformed_json_rate");
    logEvent("warn", "json_extraction_attempt", { success: false, error_type: type, error: error instanceof Error ? error.message : String(error) }, options.trace);
    throw new JsonStabilityError(error instanceof Error ? error.message : String(error), type);
  }

  const candidates = [extracted];
  for (let index = 0; index < maxAutoFixAttempts; index += 1) {
    const repaired = repairJsonText(candidates[candidates.length - 1]);
    if (repaired.repairs.length === 0) break;
    incrementMetric("json_repair_count");
    logEvent("info", "json_auto_repair_attempt", { attempt: index + 1, repairs: repaired.repairs }, options.trace);
    candidates.push(repaired.repairedText);
  }

  let lastError: unknown;
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      const parsed = JSON.parse(candidates[index]) as T;
      if (options.validate) {
        const validation = options.validate(parsed);
        if (!validation.valid) {
          logEvent("warn", "json_validation_failed", { issues: validation.issues }, options.trace);
          throw new JsonStabilityError(`Schema mismatch: ${validation.issues.join("; ")}`, "schema_mismatch");
        }
      }
      return { parsed, attempts: index + 1, autoFixed: index > 0 };
    } catch (error) {
      lastError = error;
    }
  }

  const type = parseErrorType(lastError);
  incrementMetric("malformed_json_rate");
  throw new JsonStabilityError(lastError instanceof Error ? lastError.message : String(lastError), type);
}

export function buildJsonRetryInstruction(errorType: JsonStabilityErrorType, previousError: string): string {
  const continuationHint = errorType === "truncated_output"
    ? "Continue from the last valid JSON token if the prior output was truncated, but return the complete JSON object."
    : "Return the complete JSON object from scratch.";

  return [
    `Previous response failed with ${errorType}: ${previousError}`,
    "Return ONLY valid JSON.",
    "Do not include markdown.",
    "Do not include explanations.",
    continuationHint,
  ].join(" ");
}
