export type LogLevel = "debug" | "info" | "warn" | "error";

export interface TraceContext {
  correlation_id: string;
  request_id?: string;
}

export function createTraceContext(requestId?: string): TraceContext {
  return {
    correlation_id: requestId ?? `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    request_id: requestId,
  };
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}, trace?: TraceContext): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    correlation_id: trace?.correlation_id,
    ...fields,
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
}
