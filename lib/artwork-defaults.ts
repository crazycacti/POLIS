import type { PosterArtworkMovieSource, PosterArtworkSource } from "@/lib/poster-query";

export type ArtworkKeyAvailability = {
  hasTmdb: boolean;
  hasFanart: boolean;
  hasTvdb: boolean;
};

export function pickDefaultArtworkSource(keys: ArtworkKeyAvailability): PosterArtworkSource {
  if (keys.hasTmdb) return "tmdb";
  if (keys.hasFanart) return "fanart";
  if (keys.hasTvdb) return "tvdb";
  return "tmdb";
}

export function pickDefaultArtworkMovieSource(
  keys: ArtworkKeyAvailability,
): PosterArtworkMovieSource {
  if (keys.hasTmdb) return "tmdb";
  if (keys.hasFanart) return "fanart";
  return "tmdb";
}
