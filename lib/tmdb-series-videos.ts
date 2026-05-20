import { episodeThumbnailUrl } from "@/lib/episode-thumbnail";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbApiGet } from "@/lib/tmdb-api-get";

export type StremioMetaVideo = {
  id: string;
  title: string;
  released: string;
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

function maxEpisodes(): number | null {
  return polisEnvPositiveInt("POLIS_META_MAX_EPISODES");
}

function isoReleased(airDate: string | undefined): string {
  const d = airDate?.trim();
  if (!d) return new Date(0).toISOString();
  return `${d}T00:00:00.000Z`;
}

export async function fetchTmdbSeriesVideos(params: {
  tmdbTvId: number;
  imdbId: string;
  credential: TmdbCredential;
  language: string;
}): Promise<StremioMetaVideo[]> {
  const { tmdbTvId, imdbId, credential, language } = params;
  const showUrl = new URL(`https://api.themoviedb.org/3/tv/${tmdbTvId}`);
  showUrl.searchParams.set("language", language);
  const showRaw = (await tmdbApiGet(showUrl, credential)) as {
    number_of_seasons?: number;
  } | null;
  const seasonCount = showRaw?.number_of_seasons ?? 0;
  if (seasonCount < 0) return [];

  const videos: StremioMetaVideo[] = [];
  const cap = maxEpisodes();

  for (let season = 0; season <= seasonCount; season += 1) {
    if (cap != null && videos.length >= cap) break;

    const seasonUrl = new URL(`https://api.themoviedb.org/3/tv/${tmdbTvId}/season/${season}`);
    seasonUrl.searchParams.set("language", language);
    const seasonRaw = (await tmdbApiGet(seasonUrl, credential)) as SeasonJson | null;
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
