import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import type { TmdbCreditsBlock } from "@/lib/tmdb-credits-parse";

export type { TmdbCreditsBlock } from "@/lib/tmdb-credits-parse";
export { creditsBlockFromDetails, parseTmdbCredits } from "@/lib/tmdb-credits-parse";

export async function fetchTmdbCredits(
  kind: "movie" | "tv",
  tmdbId: number,
  credential: TmdbCredential,
  language: string,
): Promise<TmdbCreditsBlock | null> {
  const path =
    kind === "tv"
      ? `https://api.themoviedb.org/3/tv/${tmdbId}/aggregate_credits`
      : `https://api.themoviedb.org/3/movie/${tmdbId}/credits`;
  const url = new URL(path);
  url.searchParams.set("language", language);
  const raw = await tmdbApiGet(url, credential);
  if (!raw || typeof raw !== "object") return null;
  return raw as TmdbCreditsBlock;
}
