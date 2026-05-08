export interface JsonSanitizationResult {
  text: string;
  applied: string[];
}

export function sanitizeJsonOutput(rawText: string): JsonSanitizationResult {
  const applied: string[] = [];
  let text = rawText ?? "";

  const withoutInvalid = text.replace(/\u0000/g, "");
  if (withoutInvalid !== text) applied.push("removed_non_utf8_chars");
  text = withoutInvalid;

  const withoutInvisible = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (withoutInvisible !== text) applied.push("removed_invisible_chars");
  text = withoutInvisible;

  const normalizedQuotes = text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  if (normalizedQuotes !== text) applied.push("normalized_curly_quotes");
  text = normalizedQuotes;

  const withoutFences = text
    .replace(/^\s*```(?:json|JSON)?\s*/g, "")
    .replace(/\s*```\s*$/g, "")
    .replace(/```(?:json|JSON)?/g, "")
    .replace(/```/g, "");
  if (withoutFences !== text) applied.push("removed_markdown_fences");
  text = withoutFences;

  return { text: text.trim(), applied };
}
