export type JsonExtractionErrorType = "empty_response" | "malformed_json" | "truncated_output";

export class JsonExtractionError extends Error {
  constructor(message: string, public readonly type: JsonExtractionErrorType) {
    super(message);
  }
}

export interface JsonExtractionResult {
  jsonText: string;
  strippedPrefix: boolean;
  strippedSuffix: boolean;
}

export function extractFirstValidJsonObject(text: string): JsonExtractionResult {
  if (!text.trim()) {
    throw new JsonExtractionError("LLM returned an empty response.", "empty_response");
  }

  const start = text.indexOf("{");
  if (start === -1) {
    throw new JsonExtractionError("Unable to locate a JSON object start.", "malformed_json");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      return {
        jsonText: text.slice(start, index + 1).trim(),
        strippedPrefix: start > 0,
        strippedSuffix: text.slice(index + 1).trim().length > 0,
      };
    }
  }

  throw new JsonExtractionError("JSON object appears truncated before closing brace.", "truncated_output");
}
