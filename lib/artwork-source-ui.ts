import type { ArtworkKeyAvailability } from "@/lib/artwork-defaults";
import type {
  PosterArtworkFallback,
  PosterArtworkMovieSource,
  PosterArtworkSource,
} from "@/lib/poster-query";

export type ArtworkSourceKey = "tmdb" | "fanart" | "tvdb" | null;

export type ArtworkSourceUiOption = {
  value: PosterArtworkSource;
  label: string;
  key: ArtworkSourceKey;
  recommended?: boolean;
};

export type ArtworkFallbackUiOption = {
  value: PosterArtworkFallback;
  label: string;
  key: ArtworkSourceKey;
  recommended?: boolean;
};

export const POSTER_ARTWORK_UI_OPTIONS: ArtworkSourceUiOption[] = [
  { value: "tmdb", label: "TMDB", key: "tmdb", recommended: true },
  { value: "fanart", label: "Fanart.tv", key: "fanart" },
  { value: "tvdb", label: "TheTVDB (TV series)", key: "tvdb" },
  { value: "metahub", label: "MetaHub", key: null },
  { value: "anilist", label: "AniList", key: "tmdb" },
  { value: "kitsu", label: "Kitsu", key: "tmdb" },
  { value: "mal", label: "MyAnimeList (Jikan)", key: "tmdb" },
];

export const POSTER_ARTWORK_MOVIE_UI_OPTIONS: {
  value: PosterArtworkMovieSource;
  label: string;
  key: ArtworkSourceKey;
  recommended?: boolean;
}[] = [
  { value: "tmdb", label: "TMDB", key: "tmdb", recommended: true },
  { value: "fanart", label: "Fanart.tv", key: "fanart" },
  { value: "metahub", label: "MetaHub", key: null },
  { value: "anilist", label: "AniList", key: "tmdb" },
  { value: "kitsu", label: "Kitsu", key: "tmdb" },
  { value: "mal", label: "MyAnimeList (Jikan)", key: "tmdb" },
];

export const POSTER_ARTWORK_FALLBACK_UI_OPTIONS: ArtworkFallbackUiOption[] = [
  { value: "metahub", label: "MetaHub", key: null, recommended: true },
  { value: "tmdb", label: "TMDB", key: "tmdb" },
  { value: "fanart", label: "Fanart.tv", key: "fanart" },
  { value: "tvdb", label: "TheTVDB", key: "tvdb" },
];

export function isArtworkKeySatisfied(
  key: ArtworkSourceKey,
  availability: ArtworkKeyAvailability,
): boolean {
  if (key === null) return true;
  if (key === "tmdb") return availability.hasTmdb;
  if (key === "fanart") return availability.hasFanart;
  return availability.hasTvdb;
}

export function shouldAutoResetArtworkSource(
  source: PosterArtworkSource,
  availability: ArtworkKeyAvailability,
): boolean {
  const opt = POSTER_ARTWORK_UI_OPTIONS.find((o) => o.value === mapLegacyArtworkSource(source));
  if (!opt) return true;
  if (opt.key === null || opt.key === "tmdb") return false;
  return !isArtworkKeySatisfied(opt.key, availability);
}

export function shouldAutoResetArtworkMovieSource(
  source: PosterArtworkMovieSource,
  availability: ArtworkKeyAvailability,
): boolean {
  const opt = POSTER_ARTWORK_MOVIE_UI_OPTIONS.find(
    (o) => o.value === mapLegacyArtworkMovieSource(source),
  );
  if (!opt) return true;
  if (opt.key === null || opt.key === "tmdb") return false;
  return !isArtworkKeySatisfied(opt.key, availability);
}

export function artworkOptionLabel(
  opt: { label: string; recommended?: boolean },
  available: boolean,
): string {
  if (!available) return `${opt.label} (key required)`;
  if (opt.recommended) return `${opt.label} (recommended)`;
  return opt.label;
}

export function mapLegacyArtworkSource(source: PosterArtworkSource): PosterArtworkSource {
  if (source === "auto") return "tmdb";
  return source;
}

export function mapLegacyArtworkMovieSource(
  source: PosterArtworkMovieSource,
): PosterArtworkMovieSource {
  if (source === "auto") return "tmdb";
  return source;
}
