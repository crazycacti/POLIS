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

export type UpstreamJsonResult<T> = { value: T | null; outcome: UpstreamJsonOutcome };

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
  const raw = await readPolisDiskJson<unknown>(namespace, UPSTREAM_CACHE_SCOPE, params.cacheKey);
  const cached = isEnvelope<T>(raw) ? raw : null;
  const now = Date.now();

  if (cached && "value" in cached && now - cached.at <= params.ttlMs) {
    return { value: cached.value, outcome: "fresh" };
  }
  if (cached && !("value" in cached) && now - cached.at <= params.negativeTtlMs) {
    return { value: null, outcome: "missing" };
  }

  const scope: UpstreamCallScope = {
    provider: params.provider,
    credentialFingerprint: params.credentialFingerprint ?? PUBLIC_UPSTREAM_CREDENTIAL,
    serverKeyProfile: params.serverKeyProfile ?? null,
    background: upstreamCallIsBackground(),
    authFailureCooldown: params.authFailureCooldown,
  };
  if (guard.backgroundSkipReason(scope)) return fallbackFrom(cached);

  const store = (envelope: Envelope<T>) => {
    void writePolisDiskJson(namespace, UPSTREAM_CACHE_SCOPE, params.cacheKey, envelope).catch((error) =>
      guard.warnOnce(`${params.provider}:write`, `${params.provider} cache write failed for ${params.label}`, error),
    );
  };

  return polisSingleflight(`upstream:${params.provider}:${params.cacheKey}`, async () => {
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
      return fallbackFrom(cached);
    }

    if (!result.ok) return fallbackFrom(cached);
    const outcome = result.value;
    if (outcome.kind === "value") {
      store({ at: Date.now(), value: outcome.value });
      return { value: outcome.value, outcome: "fetched" };
    }
    if (outcome.kind === "missing") {
      store({ at: Date.now(), missing: true });
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
