export interface FieldContract {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  version: string;
  immutable: boolean;
}

export const CANONICAL_FIELD_REGISTRY: Record<string, FieldContract> = {
  summary: { name: "summary", type: "string", version: "1.0.0", immutable: true },
  status: { name: "status", type: "string", version: "1.0.0", immutable: true },
  validation: { name: "validation", type: "object", version: "1.0.0", immutable: true },
  vulnerabilities: { name: "vulnerabilities", type: "array", version: "1.0.0", immutable: true },
  severity: { name: "severity", type: "string", version: "1.0.0", immutable: true },
  remediation: { name: "remediation", type: "array", version: "1.0.0", immutable: true },
  endpoints: { name: "endpoints", type: "array", version: "1.0.0", immutable: true },
  response_schema: { name: "response_schema", type: "object", version: "1.0.0", immutable: true },
  metrics: { name: "metrics", type: "array", version: "1.0.0", immutable: true },
};

export function isCanonicalField(name: string): boolean {
  return Boolean(CANONICAL_FIELD_REGISTRY[name]);
}

export function validateSchemaCompatibility(fields: Record<string, { type: string }>): string[] {
  const issues: string[] = [];
  for (const [name, field] of Object.entries(fields)) {
    const contract = CANONICAL_FIELD_REGISTRY[name];
    if (contract && field.type !== contract.type) {
      issues.push(`Canonical field '${name}' must remain type '${contract.type}', received '${field.type}'`);
    }
  }
  return issues;
}
