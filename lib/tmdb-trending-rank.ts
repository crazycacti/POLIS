import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import type { TmdbFindHit } from "@/lib/tmdb-resolve";

// Trending moves through the day; a few hours keeps the rank current without a call per poster.
export const TMDB_TRENDING_TTL_SEC = 3 * 60 * 60;
export const MAX_TREND_RANK = 10;

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
  const raw = (await tmdbApiGet(tmdbTrendingUrl(hit.stremioType, language), credential, {
    ttlSec: TMDB_TRENDING_TTL_SEC,
  })) as { results?: { id?: number }[] } | null;
  return trendingRankIn(raw?.results ?? [], hit.tmdbId);
}
