const DEFAULT_MAX_TRACKED_KEYS = 10_000;

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly limit: () => number,
    private readonly maxTrackedKeys = DEFAULT_MAX_TRACKED_KEYS,
  ) {}

  private live(key: string, now: number): number[] {
    const times = this.hits.get(key) ?? [];
    for (let oldest = times[0]; oldest != null && now - oldest >= this.windowMs; oldest = times[0]) times.shift();
    return times;
  }

  allows(key: string, now = Date.now()): boolean {
    return this.live(key, now).length < this.limit();
  }

  record(key: string, now = Date.now()): void {
    const times = this.live(key, now);
    times.push(now);
    this.hits.delete(key);
    if (this.hits.size >= this.maxTrackedKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    this.hits.set(key, times);
  }

  take(key: string, now = Date.now()): boolean {
    if (!this.allows(key, now)) return false;
    this.record(key, now);
    return true;
  }

  retryAfterSec(key: string, now = Date.now()): number {
    const times = this.live(key, now);
    if (times.length < this.limit()) return 0;
    const oldest = times[0];
    return oldest == null ? 0 : Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
  }
}
