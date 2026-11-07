import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { fetchUpstream } from "@/lib/upstream-fetch";
import { upstreamCredentialFingerprint } from "@/lib/upstream-guard";
import { cachedUpstreamJson, upstreamNextRevalidateSeconds } from "@/lib/upstream-json-cache";

// Scores and air dates change daily; TMDB terms also cap caching at six months.
const DEFAULT_TMDB_DISK_TTL_SEC = 24 * 60 * 60;
const TMDB_MISSING_TTL_MS = 6 * 60 * 60 * 1000;

function tmdbDiskTtlMs(): number {
  return (polisEnvPositiveInt("POLIS_CACHE_TMDB_TTL_SEC") ?? DEFAULT_TMDB_DISK_TTL_SEC) * 1000;
}

function tmdbCredentialFingerprint(credential: TmdbCredential): string {
  return upstreamCredentialFingerprint(
    credential.kind === "bearer" ? `bearer:${credential.token}` : `api_key:${credential.key}`,
  );
}

export async function tmdbApiGet(
  url: URL,
  credential: TmdbCredential,
  options: { ttlSec?: number; timeoutMs?: number } = {},
): Promise<unknown> {
  const target = new URL(url.toString());
  const headers: Record<string, string> = { Accept: "application/json" };

  if (credential.kind === "api_key") {
    target.searchParams.set("api_key", credential.key);
  } else {
    headers.Authorization = `Bearer ${credential.token}`;
  }

  const ttlMs = options.ttlSec != null ? options.ttlSec * 1000 : tmdbDiskTtlMs();
  const result = await cachedUpstreamJson<unknown>({
    provider: "tmdb",
    cacheKey: `${url.pathname}${url.search}`,
    ttlMs,
    negativeTtlMs: Math.min(ttlMs, TMDB_MISSING_TTL_MS),
    label: url.pathname,
    credentialFingerprint: tmdbCredentialFingerprint(credential),
    request: () =>
      fetchUpstream(target, {
        headers,
        timeoutMs: options.timeoutMs,
        revalidateSeconds: upstreamNextRevalidateSeconds(ttlMs),
      }),
    parse: (payload) => payload ?? null,
  });
  if (result.error !== undefined) throw result.error;
  return result.value;
}
