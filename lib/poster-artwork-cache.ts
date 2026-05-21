import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
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
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import type {
  PosterArtworkFallback,
  PosterArtworkMovieSource,
  PosterArtworkSource,
} from "@/lib/poster-query";
import { integratorCacheFingerprint } from "@/lib/integrator-cache-fingerprint";
import { fetchUpstream } from "@/lib/upstream-fetch";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

type MemoryEntry = { buffer: Buffer; at: number };

const memory = new Map<string, MemoryEntry>();
const BASE_EXT = ".jpg";

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
}): string {
  const scope = params.configId?.trim() || "_";
  const integrator =
    scope === "_" ? (params.integratorFingerprint?.trim() || "_") : "_";
  return [
    String(POLIS_RENDERER_REVISION),
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

function rememberInMemory(cacheKey: string, buffer: Buffer): void {
  const max = posterArtworkMemoryMax();
  if (max == null) return;
  memory.set(cacheKey, { buffer, at: Date.now() });
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

function memoryHit(cacheKey: string): Buffer | null {
  const max = posterArtworkMemoryMax();
  if (max == null) return null;
  const hit = memory.get(cacheKey);
  if (!hit) return null;
  const ttlMs = posterArtworkMemoryTtlMs();
  if (ttlMs != null && Date.now() - hit.at > ttlMs) {
    memory.delete(cacheKey);
    return null;
  }
  return hit.buffer;
}

async function fetchPosterBaseBuffer(params: {
  imdbId: string;
  overlay: Pick<
    PosterOverlayQuery,
    "artwork" | "artworkMovie" | "artworkFallback" | "logoOnPoster"
  >;
  resolved: ResolvedTitle;
  credential: TmdbCredential;
  language: string;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
}): Promise<Buffer | null> {
  ensurePolisSharpConfigured();

  const tmdbPosters =
    params.overlay.artwork === "tmdb"
      ? await fetchTmdbImagePosters(params.resolved, params.credential)
      : undefined;

  const imageUrls = await resolvePosterImageCandidates({
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

  let input: Buffer | null = null;
  for (const url of imageUrls) {
    const imgRes = await fetchUpstream(url, { revalidateSeconds: 86400 });
    if (!imgRes.ok) continue;
    input = Buffer.from(await imgRes.arrayBuffer());
    break;
  }
  if (!input) return null;

  return sharp(input).resize(500, 750, { fit: "cover", position: "attention" }).toBuffer();
}

export async function getPosterBaseBufferCached(params: {
  imdbId: string;
  overlay: Pick<
    PosterOverlayQuery,
    "artwork" | "artworkMovie" | "artworkFallback" | "logoOnPoster"
  >;
  resolved: ResolvedTitle;
  credential: TmdbCredential;
  language: string;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
  configId: string | null;
  integratorFingerprint?: string;
}): Promise<Buffer | null> {
  const cacheKey = posterArtworkCacheKey({
    imdbId: params.imdbId,
    language: params.language,
    configId: params.configId,
    integratorFingerprint: params.integratorFingerprint,
    artwork: params.overlay.artwork,
    artworkMovie: params.overlay.artworkMovie,
    artworkFallback: params.overlay.artworkFallback,
    logoOnPoster: params.overlay.logoOnPoster,
  });
  const scope = polisCacheScope(params.configId);

  const mem = memoryHit(cacheKey);
  if (mem) return mem;

  const diskBytes = await readPolisDiskBytes("poster-base", scope, cacheKey, BASE_EXT);
  if (diskBytes) {
    rememberInMemory(cacheKey, diskBytes);
    return diskBytes;
  }

  const flightKey = `poster-base:${scope}:${cacheKey}`;
  return polisSingleflight(flightKey, async () => {
    const raced = await readPolisDiskBytes("poster-base", scope, cacheKey, BASE_EXT);
    if (raced) return raced;

    const buffer = await fetchPosterBaseBuffer(params);
    if (!buffer) return null;
    void writePolisDiskBytes("poster-base", scope, cacheKey, BASE_EXT, buffer).catch(() => {});
    rememberInMemory(cacheKey, buffer);
    return buffer;
  });
}
