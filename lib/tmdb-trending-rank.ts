import { polisCacheRoot } from "@/lib/polis-cache-path";
import { polisDiskCacheEnabled } from "@/lib/polis-disk-cache";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbApiGetResult } from "@/lib/tmdb-api-get";
import type { TmdbFindHit } from "@/lib/tmdb-resolve";

export const TMDB_TRENDING_TTL_SEC = 3 * 60 * 60;
export const MAX_TREND_RANK = 10;
const TRENDING_MEMORY_MAX = 64;

type TrendingRows = { id?: number }[];

const trendingMemory = new Map<string, { rows: TrendingRows; expiresAt: number }>();

function rememberTrending(key: string, rows: TrendingRows, storedAt: number): void {
  trendingMemory.delete(key);
  trendingMemory.set(key, { rows, expiresAt: storedAt + TMDB_TRENDING_TTL_SEC * 1000 });
  if (trendingMemory.size > TRENDING_MEMORY_MAX) {
    const oldest = trendingMemory.keys().next().value;
    if (oldest !== undefined) trendingMemory.delete(oldest);
  }
}

async function trendingTopRows(
  stremioType: "movie" | "series",
  credential: TmdbCredential,
  language: string,
): Promise<TrendingRows> {
  const url = tmdbTrendingUrl(stremioType, language);
  const memoryKey = `${polisCacheRoot()}\0${url.pathname}${url.search}`;
  const remembered = trendingMemory.get(memoryKey);
  if (remembered && remembered.expiresAt > Date.now()) return remembered.rows;
  const result = await tmdbApiGetResult(url, credential, { ttlSec: TMDB_TRENDING_TTL_SEC });
  const raw = result.value as { results?: TrendingRows } | null;
  const rows = (raw?.results ?? []).slice(0, MAX_TREND_RANK);
  if (polisDiskCacheEnabled() && result.storedAt != null) rememberTrending(memoryKey, rows, result.storedAt);
  return rows;
}

export function tmdbTrendingUrl(stremioType: "movie" | "series", language: string, page = 1): URL {
  const url = new URL(
    `https://api.themoviedb.org/3/trending/${stremioType === "movie" ? "movie" : "tv"}/day`,
  );
  url.searchParams.set("language", language);
  url.searchParams.set("page", String(page));
  return url;
}

export function trendingRankIn(rows: { id?: number }[], tmdbId: number): number | null {
  const index = rows.slice(0, MAX_TREND_RANK).findIndex((row) => row.id === tmdbId);
  return index >= 0 ? index + 1 : null;
}

export async function fetchTmdbTrendingRank(
  hit: TmdbFindHit,
  credential: TmdbCredential,
  language: string,
): Promise<number | null> {
  return trendingRankIn(await trendingTopRows(hit.stremioType, credential, language), hit.tmdbId);
}
