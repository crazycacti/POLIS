import { posterDiskExtension } from "@/lib/poster-output-format";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { polisCacheScope } from "@/lib/polis-cache-path";
import { resolvePolisDiskCachePath, writePolisDiskBytes } from "@/lib/polis-disk-cache";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { withPolisRenderLimit } from "@/lib/polis-render-limit";
import { renderPosterForImdb } from "@/lib/poster-pipeline";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import { parsePosterOverlayQuery, serializePosterQuery } from "@/lib/poster-query";
import { integratorCacheFingerprint } from "@/lib/integrator-cache-fingerprint";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

type MemoryEntry = { image: Buffer; at: number };

const memory = new Map<string, MemoryEntry>();

export type PosterCacheResult =
  | { source: "disk"; path: string }
  | { source: "buffer"; image: Buffer };

function posterMemoryCacheMax(): number | null {
  return polisEnvPositiveInt("POLIS_CACHE_MEMORY_POSTERS");
}

function posterMemoryCacheTtlMs(): number | null {
  const sec = polisEnvPositiveInt("POLIS_CACHE_MEMORY_POSTERS_TTL_SEC");
  return sec != null ? sec * 1000 : null;
}

export function posterRenderCacheKey(params: {
  imdbId: string;
  overlayQueryString: string;
  language: string;
  configId: string | null;
  integratorFingerprint?: string;
}): string {
  const overlay = parsePosterOverlayQuery(new URLSearchParams(params.overlayQueryString));
  const canonicalOverlay = serializePosterQuery(overlay);
  const scope = params.configId?.trim() || "_";
  const integrator =
    scope === "_" ? (params.integratorFingerprint?.trim() || "_") : "_";
  return [
    String(POLIS_RENDERER_REVISION),
    scope,
    integrator,
    params.language,
    params.imdbId,
    canonicalOverlay,
  ].join("\0");
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
  const overlayQueryString = serializePosterQuery(params.overlay);
  const cacheKey = posterRenderCacheKey({
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
  });
  const scope = polisCacheScope(params.configId);

  const mem = memoryHit(cacheKey);
  if (mem) return { source: "buffer", image: mem };

  const ext = posterDiskExtension();
  const diskPath = await resolvePolisDiskCachePath("poster", scope, cacheKey, ext);
  if (diskPath) {
    return { source: "disk", path: diskPath };
  }

  const flightKey = `poster:${scope}:${cacheKey}`;
  const rendered = await polisSingleflight(flightKey, async () => {
    const racedPath = await resolvePolisDiskCachePath("poster", scope, cacheKey, ext);
    if (racedPath) return { source: "disk" as const, path: racedPath };

    const image = await withPolisRenderLimit(() =>
      renderPosterForImdb({
        imdbId: params.imdbId,
        overlay: params.overlay,
        credential: params.credential,
        language: params.language,
        mdblistApiKey: params.mdblistApiKey,
        fanartApiKey: params.fanartApiKey,
        tvdbCredentials: params.tvdbCredentials,
        configId: params.configId,
      }),
    );
    if (!image) return null;
    void writePolisDiskBytes("poster", scope, cacheKey, ext, image).catch(() => {});
    rememberInMemory(cacheKey, image);
    return { source: "buffer" as const, image };
  });

  if (!rendered) return null;
  if (rendered.source === "disk") return rendered;
  return { source: "buffer", image: rendered.image };
}
