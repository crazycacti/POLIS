const TMDB_STILL_BASE = "https://image.tmdb.org/t/p/w780";

export function metahubEpisodeThumbnailUrl(
  imdbId: string,
  season: number,
  episode: number,
): string {
  return `https://episodes.metahub.space/${imdbId}/${season}/${episode}/w780.jpg`;
}

export function tmdbStillThumbnailUrl(stillPath: string): string {
  const path = stillPath.startsWith("/") ? stillPath : `/${stillPath}`;
  return `${TMDB_STILL_BASE}${path}`;
}

export function episodeThumbnailUrl(params: {
  imdbId: string;
  season: number;
  episode: number;
  stillPath?: string | null;
}): string {
  const still = params.stillPath?.trim();
  if (still) return tmdbStillThumbnailUrl(still);
  return metahubEpisodeThumbnailUrl(params.imdbId, params.season, params.episode);
}
