import { createHash } from "node:crypto";

import { readPolisDiskBytes, readPolisDiskJson, writePolisDiskJson } from "@/lib/polis-disk-cache";
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

function tmdbDiskTtlMs(): number | null {
  const sec = polisEnvPositiveInt("POLIS_CACHE_TMDB_TTL_SEC");
  return sec != null ? sec * 1000 : null;
}

async function readTmdbDiskCache(cacheKey: string): Promise<unknown | null> {
  const ttlMs = tmdbDiskTtlMs();
  if (ttlMs != null) {
    return readPolisDiskJson<unknown>("tmdb", "g", cacheKey, ttlMs);
  }
  const raw = await readPolisDiskBytes("tmdb", "g", cacheKey, ".json");
  if (!raw) return null;
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export async function tmdbApiGet(url: URL, credential: TmdbCredential): Promise<unknown> {
  const target = new URL(url.toString());
  const headers: Record<string, string> = { Accept: "application/json" };

  if (credential.kind === "api_key") {
    target.searchParams.set("api_key", credential.key);
  } else {
    headers.Authorization = `Bearer ${credential.token}`;
  }

  const cacheKey = tmdbCacheKey(target, credential);

  return polisSingleflight(`tmdb:${cacheKey}`, async () => {
    const cached = await readTmdbDiskCache(cacheKey);
    if (cached !== null) return cached;

    const response = await fetchUpstream(target, { headers, revalidateSeconds: 86400 });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    void writePolisDiskJson("tmdb", "g", cacheKey, data).catch(() => {});
    return data;
  });
}
