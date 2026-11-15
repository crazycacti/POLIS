const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CLIENT = 10;
const MAX_FAILURES_PER_PROFILE = 100;
const MAX_TRACKED_CLIENTS = 20_000;
const MAX_TRACKED_PROFILES = 10_000;
const MAX_CLIENT_KEY_LENGTH = 64;

type AttemptWindow = { failures: number; windowStart: number };

const clientAttempts = new Map<string, AttemptWindow>();
const profileAttempts = new Map<string, AttemptWindow>();

const clientKey = (configId: string, client: string) => `${configId}\0${client.slice(0, MAX_CLIENT_KEY_LENGTH)}`;

function activeWindow(map: Map<string, AttemptWindow>, key: string, now: number): AttemptWindow | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (now - entry.windowStart >= WINDOW_MS) {
    map.delete(key);
    return null;
  }
  return entry;
}

function retryAfter(map: Map<string, AttemptWindow>, key: string, limit: number, now: number): number | null {
  const entry = activeWindow(map, key, now);
  if (!entry || entry.failures < limit) return null;
  return Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));
}

function dropExpired(map: Map<string, AttemptWindow>, now: number): void {
  for (const [key, entry] of map) {
    if (now - entry.windowStart >= WINDOW_MS) map.delete(key);
  }
}

function bumpClient(key: string, now: number): void {
  const entry = activeWindow(clientAttempts, key, now);
  if (entry) {
    entry.failures += 1;
    return;
  }
  if (clientAttempts.size >= MAX_TRACKED_CLIENTS) {
    const oldest = clientAttempts.keys().next().value;
    if (oldest !== undefined) clientAttempts.delete(oldest);
  }
  clientAttempts.set(key, { failures: 1, windowStart: now });
}

function bumpProfile(configId: string, now: number): boolean {
  const entry = activeWindow(profileAttempts, configId, now);
  if (entry) {
    entry.failures += 1;
    return true;
  }
  if (profileAttempts.size >= MAX_TRACKED_PROFILES) dropExpired(profileAttempts, now);
  if (profileAttempts.size >= MAX_TRACKED_PROFILES) return false;
  profileAttempts.set(configId, { failures: 1, windowStart: now });
  return true;
}

// The client limit keeps one guesser from locking the owner out; the profile ceiling caps guesses spread over many addresses and is never evicted while live.
export function passwordAttemptRetryAfterSeconds(configId: string, client: string, now = Date.now()): number | null {
  const waits = [
    retryAfter(clientAttempts, clientKey(configId, client), MAX_FAILURES_PER_CLIENT, now),
    retryAfter(profileAttempts, configId, MAX_FAILURES_PER_PROFILE, now),
  ].filter((wait): wait is number => wait != null);
  return waits.length > 0 ? Math.max(...waits) : null;
}

export function recordPasswordFailure(configId: string, client: string, now = Date.now()): boolean {
  bumpClient(clientKey(configId, client), now);
  return bumpProfile(configId, now);
}

export function clearPasswordFailures(configId: string, client: string): void {
  clientAttempts.delete(clientKey(configId, client));
}
