const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 10;
const MAX_TRACKED_CONFIGS = 10_000;

type AttemptWindow = { failures: number; windowStart: number };

const attempts = new Map<string, AttemptWindow>();

function activeWindow(configId: string, now: number): AttemptWindow | null {
  const entry = attempts.get(configId);
  if (!entry) return null;
  if (now - entry.windowStart >= WINDOW_MS) {
    attempts.delete(configId);
    return null;
  }
  return entry;
}

// Keyed by profile, not client IP: forwarded IP headers are caller-controlled.
export function passwordAttemptRetryAfterSeconds(configId: string, now = Date.now()): number | null {
  const entry = activeWindow(configId, now);
  if (!entry || entry.failures < MAX_FAILURES_PER_WINDOW) return null;
  return Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));
}

export function recordPasswordFailure(configId: string, now = Date.now()): void {
  const entry = activeWindow(configId, now);
  if (entry) {
    entry.failures += 1;
    return;
  }
  if (attempts.size >= MAX_TRACKED_CONFIGS) {
    const oldest = attempts.keys().next().value;
    if (oldest !== undefined) attempts.delete(oldest);
  }
  attempts.set(configId, { failures: 1, windowStart: now });
}

export function clearPasswordFailures(configId: string): void {
  attempts.delete(configId);
}
