export class SessionContextStore<T> {
  private readonly entries = new Map<string, T>();

  get(sessionId: string): T | undefined {
    return this.entries.get(sessionId);
  }

  set(sessionId: string, value: T): void {
    this.entries.set(sessionId, value);
  }

  delete(sessionId: string): void {
    this.entries.delete(sessionId);
  }
}
