import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { fetchArtworkBytes } from "@/lib/artwork-url-allow";
import { fetchLandscapeBase, landscapeFromPortrait } from "@/lib/landscape-artwork";
import sharp from "sharp";

import {
  fetchTmdbImagePosters,
  resolvePosterImageCandidates,
} from "@/lib/artwork-poster";
import { polisCacheScope } from "@/lib/polis-cache-path";
import {
  readPolisDiskBytes,
  resolvePolisDiskCachePath,
  writePolisDiskBytes,
} from "@/lib/polis-disk-cache";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { POLIS_ARTWORK_CACHE_GENERATION } from "@/lib/polis-renderer";
import type {
  PosterArtworkFallback,
  PosterArtworkMovieSource,
  PosterArtworkSource,
  PosterShape,
} from "@/lib/poster-query";
import { integratorCacheFingerprint } from "@/lib/integrator-cache-fingerprint";
import { fetchUpstream } from "@/lib/upstream-fetch";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

export type PosterBase = { buffer: Buffer; textless: boolean; degraded?: boolean };

type MemoryEntry = { base: PosterBase; at: number };

const memory = new Map<string, MemoryEntry>();
const BASE_EXT = ".jpg";
const TEXTLESS_BASE_EXT = ".textless.jpg";

function posterArtworkMemoryMax(): number | null {
  return polisEnvPositiveInt("POLIS_CACHE_MEMORY_POSTER_ARTWORK");
}

function posterArtworkMemoryTtlMs(): number | null {
  const sec = polisEnvPositiveInt("POLIS_CACHE_MEMORY_POSTER_ARTWORK_TTL_SEC");
  return sec != null ? sec * 1000 : null;
}

export function posterArtworkCacheKey(params: {
  imdbId: string;
  language: string;
  configId: string | null;
  integratorFingerprint?: string;
  artwork: PosterArtworkSource;
  artworkMovie: PosterArtworkMovieSource;
  artworkFallback: PosterArtworkFallback;
  logoOnPoster: boolean;
  posterShape?: PosterShape;
}): string {
  const scope = params.configId?.trim() || "_";
  const integrator =
    scope === "_" ? (params.integratorFingerprint?.trim() || "_") : "_";
  if (params.posterShape === "landscape") {
    return [
      `a${POLIS_ARTWORK_CACHE_GENERATION}`,
      "landscape",
      scope,
      integrator,
      params.language,
      params.imdbId,
    ].join("\0");
  }
  return [
    `a${POLIS_ARTWORK_CACHE_GENERATION}`,
    scope,
    integrator,
    params.language,
    params.imdbId,
    params.artwork,
    params.artworkMovie,
    params.artworkFallback,
    params.logoOnPoster ? "1" : "0",
  ].join("\0");
}

function rememberInMemory(cacheKey: string, base: PosterBase): void {
  const max = posterArtworkMemoryMax();
  if (max == null) return;
  memory.set(cacheKey, { base, at: Date.now() });
  pruneMemory(max);
}

function pruneMemory(max: number): void {
  const ttlMs = posterArtworkMemoryTtlMs();
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

function memoryHit(cacheKey: string): PosterBase | null {
  const max = posterArtworkMemoryMax();
  if (max == null) return null;
  const hit = memory.get(cacheKey);
  if (!hit) return null;
  const ttlMs = posterArtworkMemoryTtlMs();
  if (ttlMs != null && Date.now() - hit.at > ttlMs) {
    memory.delete(cacheKey);
    return null;
  }
  return hit.base;
}

async function fetchPosterBaseBuffer(params: {
  imdbId: string;
  overlay: Pick<
    PosterOverlayQuery,
    "artwork" | "artworkMovie" | "artworkFallback" | "logoOnPoster" | "posterShape"
  >;
  resolved: ResolvedTitle;
  credential: TmdbCredential;
  language: string;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
  onArtCandidate?: (textless: boolean) => void;
}): Promise<PosterBase | null> {
  ensurePolisSharpConfigured();

  if (params.overlay.posterShape === "landscape") {
    const landscape = await fetchLandscapeBase({
      imdbId: params.imdbId,
      resolved: params.resolved,
      credential: params.credential,
      onArtCandidate: params.onArtCandidate,
    });
    if (landscape) return landscape;
    const portrait = await fetchPosterBaseBuffer({
      ...params,
      overlay: { ...params.overlay, posterShape: "poster" },
    });
    if (!portrait) return null;
    return { buffer: await landscapeFromPortrait(portrait.buffer), textless: false, degraded: portrait.degraded };
  }

  const tmdbPosters =
    params.overlay.artwork === "tmdb"
      ? await fetchTmdbImagePosters(params.resolved, params.credential, params.language)
      : undefined;

  const { candidates: imageUrls, degraded } = await resolvePosterImageCandidates({
    resolved: params.resolved,
    imdbId: params.imdbId,
    credential: params.credential,
    language: params.language,
    artworkSource: params.overlay.artwork,
    artworkMovie: params.overlay.artworkMovie,
    artworkFallback: params.overlay.artworkFallback,
    fanartApiKey: params.fanartApiKey,
    tvdbCredentials: params.tvdbCredentials,
    tvdbId: params.resolved.tvdbId,
    preferTextlessArtwork: params.overlay.logoOnPoster,
    tmdbPosters,
  });
  if (imageUrls.length === 0) return null;

  for (const candidate of imageUrls) {
    params.onArtCandidate?.(candidate.textless);
    try {
      const input = await fetchArtworkBytes(candidate.url, (target, init) =>
        fetchUpstream(target, init),
      );
      if (!input) continue;
      const buffer = await sharp(input)
        .resize(500, 750, { fit: "cover", position: "attention" })
        .toBuffer();
      return { buffer, textless: candidate.textless, degraded };
    } catch (error) {
      console.warn(`[polis] artwork candidate failed for ${params.imdbId}`, error);
    }
  }
  return null;
}

export async function getPosterBaseBufferCached(params: {
  imdbId: string;
  overlay: Pick<
    PosterOverlayQuery,
    "artwork" | "artworkMovie" | "artworkFallback" | "logoOnPoster" | "posterShape"
  >;
  resolved: ResolvedTitle;
  credential: TmdbCredential;
  language: string;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
  configId: string | null;
  integratorFingerprint?: string;
  onArtCandidate?: (textless: boolean) => void;
}): Promise<PosterBase | null> {
  const cacheKey = posterArtworkCacheKey({
    imdbId: params.imdbId,
    language: params.language,
    configId: params.configId,
    integratorFingerprint: params.integratorFingerprint,
    artwork: params.overlay.artwork,
    artworkMovie: params.overlay.artworkMovie,
    artworkFallback: params.overlay.artworkFallback,
    logoOnPoster: params.overlay.logoOnPoster,
    posterShape: params.overlay.posterShape,
  });
  const scope = polisCacheScope(params.configId);

  const mem = memoryHit(cacheKey);
  if (mem) return mem;

  const readDisk = async (): Promise<PosterBase | null> => {
    const textless = await readPolisDiskBytes("poster-base", scope, cacheKey, TEXTLESS_BASE_EXT);
    if (textless) return { buffer: textless, textless: true };
    const titled = await readPolisDiskBytes("poster-base", scope, cacheKey, BASE_EXT);
    return titled ? { buffer: titled, textless: false } : null;
  };

  const disk = await readDisk();
  if (disk) {
    rememberInMemory(cacheKey, disk);
    return disk;
  }

  const flightKey = `poster-base:${scope}:${cacheKey}`;
  return polisSingleflight(flightKey, async () => {
    const raced = await readDisk();
    if (raced) return raced;

    const base = await fetchPosterBaseBuffer(params);
    if (!base) return null;
    if (base.degraded) return base;
    const ext = base.textless ? TEXTLESS_BASE_EXT : BASE_EXT;
    void writePolisDiskBytes("poster-base", scope, cacheKey, ext, base.buffer).catch(() => {});
    rememberInMemory(cacheKey, base);
    return base;
  });
}
