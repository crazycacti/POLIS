import { episodeThumbnailUrl } from "@/lib/episode-thumbnail";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbApiGet } from "@/lib/tmdb-api-get";

export type StremioMetaVideo = {
  id: string;
  title: string;
  released?: string;
  season: number;
  episode: number;
  overview?: string;
  thumbnail: string;
};

type SeasonJson = {
  season_number?: number;
  episodes?: {
    id?: number;
    name?: string;
    overview?: string;
    air_date?: string;
    season_number?: number;
    episode_number?: number;
    still_path?: string | null;
  }[];
};

const TMDB_APPEND_LIMIT = 20;
const SEASON_CHUNK_TIMEOUT_MS = 20_000;

function maxEpisodes(): number | null {
  return polisEnvPositiveInt("POLIS_META_MAX_EPISODES");
}

function isoReleased(airDate: string | undefined): string | undefined {
  const d = airDate?.trim();
  if (!d) return undefined;
  return `${d}T00:00:00.000Z`;
}

export async function fetchTmdbSeriesVideos(params: {
  tmdbTvId: number;
  imdbId: string;
  credential: TmdbCredential;
  language: string;
  seasonCount: number;
}): Promise<StremioMetaVideo[]> {
  const { tmdbTvId, imdbId, credential, language, seasonCount } = params;
  if (!Number.isInteger(seasonCount) || seasonCount < 0) return [];

  const seasonStarts: number[] = [];
  for (let first = 0; first <= seasonCount; first += TMDB_APPEND_LIMIT) seasonStarts.push(first);

  const settled = await Promise.allSettled(
    seasonStarts.map(async (first) => {
      const last = Math.min(first + TMDB_APPEND_LIMIT - 1, seasonCount);
      const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbTvId}`);
      url.searchParams.set("language", language);
      const appends = Array.from({ length: last - first + 1 }, (_, i) => `season/${first + i}`);
      url.searchParams.set("append_to_response", appends.join(","));
      const chunk = await tmdbApiGet(url, credential, { timeoutMs: SEASON_CHUNK_TIMEOUT_MS });
      if (!chunk) throw new Error(`TMDB returned no data for seasons ${first}-${last}`);
      return chunk as Record<string, unknown>;
    }),
  );
  const failed = settled.filter((result) => result.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[polis] ${failed} of ${settled.length} season requests failed for tmdb tv ${tmdbTvId}`);
  }
  const chunks = settled.map((result) => (result.status === "fulfilled" ? result.value : null));

  const videos: StremioMetaVideo[] = [];
  const cap = maxEpisodes();

  for (let season = 0; season <= seasonCount; season += 1) {
    if (cap != null && videos.length >= cap) break;

    const chunk = chunks[Math.floor(season / TMDB_APPEND_LIMIT)];
    const seasonRaw = chunk?.[`season/${season}`] as SeasonJson | undefined;
    const episodes = seasonRaw?.episodes ?? [];

    for (const ep of episodes) {
      if (cap != null && videos.length >= cap) break;
      const epNum = ep.episode_number;
      const seasonNum = ep.season_number ?? season;
      if (typeof epNum !== "number") continue;

      const title = ep.name?.trim() || `Episode ${epNum}`;
      videos.push({
        id: `${imdbId}:${seasonNum}:${epNum}`,
        title,
        released: isoReleased(ep.air_date),
        season: seasonNum,
        episode: epNum,
        overview: ep.overview?.trim() || undefined,
        thumbnail: episodeThumbnailUrl({
          imdbId,
          season: seasonNum,
          episode: epNum,
          stillPath: ep.still_path,
        }),
      });
    }
  }

  return videos;
}
