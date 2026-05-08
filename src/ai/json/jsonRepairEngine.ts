export interface JsonRepairResult {
  repairedText: string;
  repairs: string[];
}

function balanceClosers(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of text) {
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
    if (char === "{") stack.push("}");
    if (char === "[") stack.push("]");
    if ((char === "}" || char === "]") && stack[stack.length - 1] === char) stack.pop();
  }

  return `${text}${stack.reverse().join("")}`;
}

export function repairJsonText(jsonText: string): JsonRepairResult {
  const repairs: string[] = [];
  let repairedText = jsonText.trim();

  const trailingCommaFixed = repairedText.replace(/,\s*([}\]])/g, "$1");
  if (trailingCommaFixed !== repairedText) repairs.push("removed_trailing_commas");
  repairedText = trailingCommaFixed;

  const singleQuoteFixed = repairedText.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value: string) => `"${value.replace(/"/g, '\\"')}"`);
  if (singleQuoteFixed !== repairedText) repairs.push("normalized_single_quotes");
  repairedText = singleQuoteFixed;

  const balanced = balanceClosers(repairedText);
  if (balanced !== repairedText) repairs.push("added_missing_closers");
  repairedText = balanced;

  return { repairedText, repairs };
}
