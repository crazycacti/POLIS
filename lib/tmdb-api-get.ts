import { createHash } from "node:crypto";

import { readPolisDiskJson, writePolisDiskJson } from "@/lib/polis-disk-cache";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { polisSingleflight } from "@/lib/polis-singleflight";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { fetchUpstream } from "@/lib/upstream-fetch";

function tmdbCredentialFingerprint(credential: TmdbCredential): string {
  const raw =
    credential.kind === "bearer" ? `bearer:${credential.token}` : `api_key:${credential.key}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function tmdbCacheKey(url: URL, credential: TmdbCredential): string {
  return [tmdbCredentialFingerprint(credential), url.pathname, url.search].join("\0");
}

// Scores and air dates change daily; TMDB terms also cap caching at six months.
const DEFAULT_TMDB_DISK_TTL_SEC = 24 * 60 * 60;

function tmdbDiskTtlMs(): number {
  return (polisEnvPositiveInt("POLIS_CACHE_TMDB_TTL_SEC") ?? DEFAULT_TMDB_DISK_TTL_SEC) * 1000;
}

async function readTmdbDiskCache(cacheKey: string, ttlMs: number): Promise<unknown | null> {
  return readPolisDiskJson<unknown>("tmdb", "g", cacheKey, ttlMs);
}

export async function tmdbApiGet(
  url: URL,
  credential: TmdbCredential,
  options: { ttlSec?: number } = {},
): Promise<unknown> {
  const target = new URL(url.toString());
  const headers: Record<string, string> = { Accept: "application/json" };

  if (credential.kind === "api_key") {
    target.searchParams.set("api_key", credential.key);
  } else {
    headers.Authorization = `Bearer ${credential.token}`;
  }

  const cacheKey = tmdbCacheKey(target, credential);

  return polisSingleflight(`tmdb:${cacheKey}`, async () => {
    const ttlMs = options.ttlSec != null ? options.ttlSec * 1000 : tmdbDiskTtlMs();
    const cached = await readTmdbDiskCache(cacheKey, ttlMs);
    if (cached !== null) return cached;

    const response = await fetchUpstream(target, {
      headers,
      revalidateSeconds: options.ttlSec ?? DEFAULT_TMDB_DISK_TTL_SEC,
    });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    void writePolisDiskJson("tmdb", "g", cacheKey, data).catch(() => {});
    return data;
  });
}
