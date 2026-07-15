interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache {
  private readonly values = new Map<string, Entry<unknown>>();

  constructor(private readonly maxEntries = 1_000) {}

  get<T>(key: string): T | null {
    const entry = this.values.get(key) as Entry<T> | undefined;
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    this.values.delete(key);
    this.values.set(key, entry);
    return entry.value;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (!oldest) break;
      this.values.delete(oldest);
    }
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key);
  }
}
