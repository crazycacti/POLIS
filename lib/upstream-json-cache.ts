import { polisDiskCacheEnabled, readPolisDiskJson, writePolisDiskJson } from "@/lib/polis-disk-cache";
import { polisSingleflight } from "@/lib/polis-singleflight";
import {
  PUBLIC_UPSTREAM_CREDENTIAL,
  upstreamGuard,
  type UpstreamCallScope,
  type UpstreamGuard,
  type UpstreamProvider,
} from "@/lib/upstream-guard";
import { upstreamCallIsBackground } from "@/lib/upstream-priority";

export type UpstreamJsonOutcome = "fresh" | "fetched" | "stale" | "missing" | "unavailable";

export type UpstreamJsonResult<T> = {
  value: T | null;
  outcome: UpstreamJsonOutcome;
  storedAt?: number;
  error?: unknown;
};

type Envelope<T> = { at: number; value: T } | { at: number; missing: true };

type ReadOutcome<T> =
  | { kind: "value"; value: T }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "failed"; status: number };

const MISSING_STATUSES = new Set([404, 410]);
const UPSTREAM_CACHE_SCOPE = "g";

function guardReportsStatus(status: number, authFailureCooldown: boolean | undefined): boolean {
  if (status === 429) return true;
  return (status === 401 || status === 403) && authFailureCooldown !== false;
}

export function upstreamNextRevalidateSeconds(ttlMs: number): number {
  return polisDiskCacheEnabled() ? 0 : Math.floor(ttlMs / 1000);
}

function isEnvelope<T>(raw: unknown): raw is Envelope<T> {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  return typeof record.at === "number" && ("value" in record || record.missing === true);
}

function fallbackFrom<T>(cached: Envelope<T> | null): UpstreamJsonResult<T> {
  if (!cached) return { value: null, outcome: "unavailable" };
  if ("value" in cached) return { value: cached.value, outcome: "stale" };
  return { value: null, outcome: "missing" };
}

export async function cachedUpstreamJson<T>(params: {
  provider: UpstreamProvider;
  cacheKey: string;
  ttlMs: number;
  negativeTtlMs: number;
  label: string;
  request: () => Promise<Response>;
  parse: (payload: unknown) => T | null;
  credentialFingerprint?: string;
  serverKeyProfile?: string | null;
  authFailureCooldown?: boolean;
  guard?: UpstreamGuard;
}): Promise<UpstreamJsonResult<T>> {
  const guard = params.guard ?? upstreamGuard;
  const namespace = `api/${params.provider}`;
  const readCached = async (): Promise<Envelope<T> | null> => {
    const raw = await readPolisDiskJson<unknown>(namespace, UPSTREAM_CACHE_SCOPE, params.cacheKey);
    return isEnvelope<T>(raw) ? raw : null;
  };
  const freshFrom = (envelope: Envelope<T> | null): UpstreamJsonResult<T> | null => {
    if (!envelope) return null;
    const age = Date.now() - envelope.at;
    if ("value" in envelope) {
      return age <= params.ttlMs ? { value: envelope.value, outcome: "fresh", storedAt: envelope.at } : null;
    }
    return age <= params.negativeTtlMs ? { value: null, outcome: "missing" } : null;
  };

  const cached = await readCached();
  const fresh = freshFrom(cached);
  if (fresh) return fresh;

  const scope: UpstreamCallScope = {
    provider: params.provider,
    credentialFingerprint: params.credentialFingerprint ?? PUBLIC_UPSTREAM_CREDENTIAL,
    serverKeyProfile: params.serverKeyProfile ?? null,
    background: upstreamCallIsBackground(),
    authFailureCooldown: params.authFailureCooldown,
  };
  if (guard.backgroundSkipReason(scope)) return fallbackFrom(cached);

  // The flight stays open until the write lands so callers arriving right after it read the new copy.
  const store = async (envelope: Envelope<T>) => {
    try {
      await writePolisDiskJson(namespace, UPSTREAM_CACHE_SCOPE, params.cacheKey, envelope);
    } catch (error) {
      guard.warnOnce(`${params.provider}:write`, `${params.provider} cache write failed for ${params.label}`, error);
    }
  };

  const flightKey = [
    "upstream",
    params.provider,
    scope.credentialFingerprint,
    scope.serverKeyProfile ?? "",
    scope.background ? "bg" : "fg",
    params.cacheKey,
  ].join("\0");
  return polisSingleflight(flightKey, async () => {
    const raced = freshFrom(await readCached());
    if (raced) return raced;

    let result;
    try {
      result = await guard.request<ReadOutcome<T>>(scope, params.request, async (response) => {
        if (!response.ok) {
          await response.body?.cancel();
          return MISSING_STATUSES.has(response.status)
            ? { kind: "missing" }
            : { kind: "failed", status: response.status };
        }
        const value = params.parse(await response.json());
        return value == null ? { kind: "invalid" } : { kind: "value", value };
      });
    } catch (error) {
      guard.warnOnce(
        `${params.provider}:error`,
        `${params.provider} request failed for ${params.label}, serving ${cached ? "cached" : "no"} data`,
        error,
      );
      const fallback = fallbackFrom(cached);
      return fallback.outcome === "unavailable" ? { ...fallback, error } : fallback;
    }

    if (!result.ok) return fallbackFrom(cached);
    const outcome = result.value;
    if (outcome.kind === "value") {
      const storedAt = Date.now();
      await store({ at: storedAt, value: outcome.value });
      return { value: outcome.value, outcome: "fetched", storedAt };
    }
    if (outcome.kind === "missing") {
      await store({ at: Date.now(), missing: true });
      return { value: null, outcome: "missing" };
    }
    if (outcome.kind === "invalid") {
      guard.warnOnce(`${params.provider}:invalid`, `${params.provider} returned an unexpected payload for ${params.label}`);
    } else if (!guardReportsStatus(outcome.status, params.authFailureCooldown)) {
      guard.warnOnce(
        `${params.provider}:http`,
        `${params.provider} returned HTTP ${outcome.status} for ${params.label}`,
      );
    }
    return fallbackFrom(cached);
  });
}
