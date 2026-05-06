export interface TraceSpan {
  name: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
}

export class Trace {
  private spans: TraceSpan[] = [];

  startSpan(name: string): () => TraceSpan {
    const span: TraceSpan = { name, startedAt: Date.now() };
    this.spans.push(span);
    return () => {
      span.endedAt = Date.now();
      span.durationMs = span.endedAt - span.startedAt;
      return span;
    };
  }

  snapshot(): TraceSpan[] {
    return this.spans.map((span) => ({ ...span }));
  }
}
