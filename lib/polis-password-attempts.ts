const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CLIENT = 10;
const MAX_FAILURES_PER_PROFILE = 100;
const MAX_TRACKED_KEYS = 20_000;

type AttemptWindow = { failures: number; windowStart: number };

const attempts = new Map<string, AttemptWindow>();

const profileKey = (configId: string) => `p\0${configId}`;
const clientKey = (configId: string, client: string) => `c\0${configId}\0${client}`;

function activeWindow(key: string, now: number): AttemptWindow | null {
  const entry = attempts.get(key);
  if (!entry) return null;
  if (now - entry.windowStart >= WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  return entry;
}

function retryAfter(key: string, limit: number, now: number): number | null {
  const entry = activeWindow(key, now);
  if (!entry || entry.failures < limit) return null;
  return Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));
}

function bump(key: string, now: number): void {
  const entry = activeWindow(key, now);
  if (entry) {
    entry.failures += 1;
    return;
  }
  if (attempts.size >= MAX_TRACKED_KEYS) {
    const oldest = attempts.keys().next().value;
    if (oldest !== undefined) attempts.delete(oldest);
  }
  attempts.set(key, { failures: 1, windowStart: now });
}

// The client limit keeps one guesser from locking the owner out; the profile ceiling still caps guesses spread over many addresses.
export function passwordAttemptRetryAfterSeconds(configId: string, client: string, now = Date.now()): number | null {
  const waits = [
    retryAfter(clientKey(configId, client), MAX_FAILURES_PER_CLIENT, now),
    retryAfter(profileKey(configId), MAX_FAILURES_PER_PROFILE, now),
  ].filter((wait): wait is number => wait != null);
  return waits.length > 0 ? Math.max(...waits) : null;
}

export function recordPasswordFailure(configId: string, client: string, now = Date.now()): void {
  bump(clientKey(configId, client), now);
  bump(profileKey(configId), now);
}

export function clearPasswordFailures(configId: string, client: string): void {
  attempts.delete(clientKey(configId, client));
}
