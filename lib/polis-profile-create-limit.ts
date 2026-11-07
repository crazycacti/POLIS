import { polisEnvPositiveInt } from "@/lib/polis-env-int";

const WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_PER_CLIENT_PER_HOUR = 5;
const DEFAULT_SERVER_PER_HOUR = 60;
const MAX_TRACKED_CLIENTS = 10_000;
const UNKNOWN_CLIENT = "unknown";

type CreateWindow = { count: number; windowStart: number };

const perClient = new Map<string, CreateWindow>();
let serverWindow: CreateWindow = { count: 0, windowStart: 0 };

function perClientLimit(): number {
  return polisEnvPositiveInt("POLIS_PROFILE_CREATE_PER_CLIENT_PER_HOUR") ?? DEFAULT_PER_CLIENT_PER_HOUR;
}

function serverLimit(): number {
  return polisEnvPositiveInt("POLIS_PROFILE_CREATE_PER_HOUR") ?? DEFAULT_SERVER_PER_HOUR;
}

// The proxy in front of POLIS appends the caller's address last; earlier entries come from the caller.
export function profileCreateClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
  return last || request.headers.get("x-real-ip")?.trim() || UNKNOWN_CLIENT;
}

function current(entry: CreateWindow | undefined, now: number): CreateWindow {
  if (!entry || now - entry.windowStart >= WINDOW_MS) return { count: 0, windowStart: now };
  return entry;
}

function retryAfterSeconds(entry: CreateWindow, now: number): number {
  return Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));
}

export function profileCreateRetryAfterSeconds(clientKey: string, now = Date.now()): number | null {
  const server = current(serverWindow, now);
  if (server.count >= serverLimit()) return retryAfterSeconds(server, now);
  const client = current(perClient.get(clientKey), now);
  if (client.count >= perClientLimit()) return retryAfterSeconds(client, now);
  return null;
}

export function recordProfileCreated(clientKey: string, now = Date.now()): void {
  serverWindow = current(serverWindow, now);
  serverWindow.count += 1;
  const client = current(perClient.get(clientKey), now);
  client.count += 1;
  perClient.delete(clientKey);
  if (perClient.size >= MAX_TRACKED_CLIENTS) {
    const oldest = perClient.keys().next().value;
    if (oldest !== undefined) perClient.delete(oldest);
  }
  perClient.set(clientKey, client);
}
