const counters = new Map<string, number>();
const distributions = new Map<string, number[]>();

export function incrementMetric(name: string, value = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + value);
}

export function observeMetric(name: string, value: number): void {
  const values = distributions.get(name) ?? [];
  values.push(value);
  distributions.set(name, values.slice(-1000));
}

export function getMetricsSnapshot(): Record<string, unknown> {
  return {
    counters: Object.fromEntries(counters),
    distributions: Object.fromEntries(
      [...distributions.entries()].map(([name, values]) => [
        name,
        {
          count: values.length,
          average: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0,
        },
      ])
    ),
  };
}
