import { posterDiskExtension } from "@/lib/poster-output-format";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { polisCacheScope } from "@/lib/polis-cache-path";
import {
  linkPolisDiskCacheAlias,
  resolvePolisDiskCachePath,
  writePolisDiskBytes,
} from "@/lib/polis-disk-cache";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { withPolisRenderLimit } from "@/lib/polis-render-limit";
import { renderPosterForImdb } from "@/lib/poster-pipeline";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import { parsePosterOverlayQuery, serializePosterQuery } from "@/lib/poster-query";
import { integratorCacheFingerprint } from "@/lib/integrator-cache-fingerprint";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { findTmdbTitle } from "@/lib/tmdb-resolve";
import { fetchTmdbTrendingRank } from "@/lib/tmdb-trending-rank";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

type MemoryEntry = { image: Buffer; at: number };

const memory = new Map<string, MemoryEntry>();

export type PosterCacheResult =
  | { source: "disk"; path: string }
  | { source: "buffer"; image: Buffer };

function posterMemoryCacheMax(): number | null {
  return polisEnvPositiveInt("POLIS_CACHE_MEMORY_POSTERS");
}

const DEFAULT_POSTER_DISK_TTL_SEC = 7 * 24 * 60 * 60;
const STALE_RETRY_BACKOFF_MS = 10 * 60 * 1000;
const STALE_BACKOFF_MAX_KEYS = 5_000;

const staleBackoffUntil = new Map<string, number>();

function inStaleBackoff(cacheKey: string): boolean {
  const until = staleBackoffUntil.get(cacheKey);
  if (until == null) return false;
  if (Date.now() < until) return true;
  staleBackoffUntil.delete(cacheKey);
  return false;
}

function startStaleBackoff(cacheKey: string): void {
  if (staleBackoffUntil.size >= STALE_BACKOFF_MAX_KEYS) {
    const oldest = staleBackoffUntil.keys().next().value;
    if (oldest !== undefined) staleBackoffUntil.delete(oldest);
  }
  staleBackoffUntil.set(cacheKey, Date.now() + STALE_RETRY_BACKOFF_MS);
}

function posterDiskTtlMs(): number {
  return (polisEnvPositiveInt("POLIS_CACHE_POSTER_TTL_SEC") ?? DEFAULT_POSTER_DISK_TTL_SEC) * 1000;
}

function posterMemoryCacheTtlMs(): number | null {
  const sec = polisEnvPositiveInt("POLIS_CACHE_MEMORY_POSTERS_TTL_SEC");
  return sec != null ? sec * 1000 : null;
}

type PosterCacheKeyParams = {
  imdbId: string;
  overlayQueryString: string;
  language: string;
  configId: string | null;
  integratorFingerprint?: string;
};

function posterCacheKeyParts(params: PosterCacheKeyParams, prefix: string, dropTrendRank: boolean): string {
  const overlay = parsePosterOverlayQuery(new URLSearchParams(params.overlayQueryString));
  const canonicalOverlay = serializePosterQuery(dropTrendRank ? { ...overlay, trendRank: null } : overlay);
  const scope = params.configId?.trim() || "_";
  const integrator =
    scope === "_" ? (params.integratorFingerprint?.trim() || "_") : "_";
  return [prefix, scope, integrator, params.language, params.imdbId, canonicalOverlay].join("\0");
}

export function posterRenderCacheKey(params: PosterCacheKeyParams): string {
  return posterCacheKeyParts(params, String(POLIS_RENDERER_REVISION), false);
}

export function posterLatestAliasKey(params: PosterCacheKeyParams): string {
  return posterCacheKeyParts(params, "latest", true);
}

export function purgePosterMemoryCacheForConfig(configId: string): void {
  const prefix = `${String(POLIS_RENDERER_REVISION)}\0${configId.trim()}\0`;
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
}

function rememberInMemory(cacheKey: string, image: Buffer): void {
  const max = posterMemoryCacheMax();
  if (max == null) return;
  memory.set(cacheKey, { image, at: Date.now() });
  pruneMemory(max);
}

function pruneMemory(max: number): void {
  const ttlMs = posterMemoryCacheTtlMs();
  const now = Date.now();
  if (ttlMs != null) {
    for (const [key, entry] of memory) {
      if (now - entry.at > ttlMs) memory.delete(key);
    }
  }
  if (memory.size <= max) return;
  const oldest = [...memory.entries()].sort((a, b) => a[1].at - b[1].at);
  for (let i = 0; i < oldest.length - max; i++) {
    memory.delete(oldest[i][0]);
  }
}

function memoryHit(cacheKey: string): Buffer | null {
  const max = posterMemoryCacheMax();
  if (max == null) return null;

  const hit = memory.get(cacheKey);
  if (!hit) return null;

  const ttlMs = posterMemoryCacheTtlMs();
  if (ttlMs != null && Date.now() - hit.at > ttlMs) {
    memory.delete(cacheKey);
    return null;
  }

  return hit.image;
}

async function withLiveTrendRank(params: {
  imdbId: string;
  overlay: PosterOverlayQuery;
  credential: TmdbCredential;
  language: string;
}): Promise<PosterOverlayQuery> {
  if (!params.overlay.trendTags || params.overlay.trendRank != null) return params.overlay;
  try {
    const hit = await findTmdbTitle(params.imdbId, params.credential, params.language);
    const trendRank = hit ? await fetchTmdbTrendingRank(hit, params.credential, params.language) : null;
    return trendRank != null ? { ...params.overlay, trendRank } : params.overlay;
  } catch (error) {
    console.warn(`[polis] trending rank lookup failed for ${params.imdbId}`, error);
    return params.overlay;
  }
}

export async function renderPosterForImdbCached(params: {
  imdbId: string;
  overlay: PosterOverlayQuery;
  credential: TmdbCredential;
  language: string;
  mdblistApiKey: string | null;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
  configId: string | null;
}): Promise<PosterCacheResult | null> {
  const overlay = await withLiveTrendRank(params);
  const overlayQueryString = serializePosterQuery(overlay);
  const keyParams: PosterCacheKeyParams = {
    imdbId: params.imdbId,
    overlayQueryString,
    language: params.language,
    configId: params.configId,
    integratorFingerprint: integratorCacheFingerprint({
      credential: params.credential,
      mdblistApiKey: params.mdblistApiKey,
      fanartApiKey: params.fanartApiKey,
      tvdbCredentials: params.tvdbCredentials,
    }),
  };
  const cacheKey = posterRenderCacheKey(keyParams);
  const aliasKey = posterLatestAliasKey(keyParams);
  const scope = polisCacheScope(params.configId);

  const mem = memoryHit(cacheKey);
  if (mem) return { source: "buffer", image: mem };

  const ext = posterDiskExtension();
  const ttlMs = posterDiskTtlMs();
  const diskPath = await resolvePolisDiskCachePath(
    "poster",
    scope,
    cacheKey,
    ext,
    inStaleBackoff(cacheKey) ? undefined : ttlMs,
  );
  if (diskPath) {
    return { source: "disk", path: diskPath };
  }

  const findStalePoster = async () =>
    (await resolvePolisDiskCachePath("poster", scope, cacheKey, ext)) ??
    (await resolvePolisDiskCachePath("poster", scope, aliasKey, ext));

  const flightKey = `poster:${scope}:${cacheKey}`;
  const renderFresh = () =>
    polisSingleflight(flightKey, async () => {
      const racedPath = await resolvePolisDiskCachePath("poster", scope, cacheKey, ext, ttlMs);
      if (racedPath) return { source: "disk" as const, path: racedPath };

      const staleFallback = async () => {
        const stalePath = await findStalePoster();
        if (!stalePath) return null;
        startStaleBackoff(cacheKey);
        return { source: "disk" as const, path: stalePath };
      };

      let degraded = false;
      let image: Buffer | null;
      try {
        image = await withPolisRenderLimit(() =>
          renderPosterForImdb({
            imdbId: params.imdbId,
            overlay,
            credential: params.credential,
            language: params.language,
            mdblistApiKey: params.mdblistApiKey,
            fanartApiKey: params.fanartApiKey,
            tvdbCredentials: params.tvdbCredentials,
            configId: params.configId,
            onDegraded: () => {
              degraded = true;
            },
          }),
        );
      } catch (error) {
        const stale = await staleFallback();
        if (!stale) throw error;
        console.warn(`[polis] poster render failed for ${params.imdbId}, serving stale copy`, error);
        return stale;
      }
      if (!image) return staleFallback();
      if (degraded) {
        return (await staleFallback()) ?? { source: "buffer" as const, image };
      }
      void writePolisDiskBytes("poster", scope, cacheKey, ext, image)
        .then(() => linkPolisDiskCacheAlias("poster", scope, cacheKey, aliasKey, ext))
        .catch((error) => console.warn(`[polis] poster cache write failed for ${params.imdbId}`, error));
      rememberInMemory(cacheKey, image);
      return { source: "buffer" as const, image };
    });

  const stalePath = await findStalePoster();
  if (stalePath) {
    if (!inStaleBackoff(cacheKey)) {
      void renderFresh().catch((error) => {
        startStaleBackoff(cacheKey);
        console.warn(`[polis] background poster refresh failed for ${params.imdbId}`, error);
      });
    }
    return { source: "disk", path: stalePath };
  }

  const rendered = await renderFresh();
  if (!rendered) return null;
  if (rendered.source === "disk") return rendered;
  return { source: "buffer", image: rendered.image };
}
