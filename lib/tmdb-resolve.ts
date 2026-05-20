import type { TmdbCredential } from "@/lib/tmdb-auth";
import {
  creditsBlockFromDetails,
  fetchTmdbCredits,
  parseTmdbCredits,
  type TmdbCreditsBlock,
} from "@/lib/tmdb-credits";
import { fetchTmdbSeriesVideos, type StremioMetaVideo } from "@/lib/tmdb-series-videos";
import { tmdbApiGet } from "@/lib/tmdb-api-get";

type FindResponse = {
  movie_results?: { id: number }[];
  tv_results?: { id: number }[];
};

type MovieDetailsJson = {
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  genres?: { name?: string }[];
  release_date?: string;
  first_air_date?: string;
  last_air_date?: string;
  status?: string;
  runtime?: number;
  episode_run_time?: number[];
  production_countries?: { iso_3166_1?: string; name?: string }[];
  credits?: {
    cast?: { name?: string; order?: number }[];
    crew?: { name?: string; job?: string }[];
  };
  aggregate_credits?: {
    cast?: { name?: string; order?: number }[];
    crew?: { name?: string; job?: string }[];
  };
};

type LogoImageJson = {
  file_path?: string;
  iso_639_1?: string | null;
  vote_count?: number;
  width?: number;
  height?: number;
};

type ImagesJson = {
  logos?: LogoImageJson[];
};

type ExternalIdsJson = {
  imdb_id?: string | null;
  tvdb_id?: number | null;
};

export type ResolvedTitle = {
  imdbId: string;
  stremioType: "movie" | "series";
  title: string;
  overview: string;
  releaseYear: string | undefined;
  releaseInfo: string | undefined;
  releasedIso: string | null;
  lastAirDateIso: string | null;
  status: string | null;
  runtimeMinutes: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  genreNames: string[];
  cast: string[];
  directors: string[];
  country: string | null;
  tmdbNumericId: number;
  tvdbId: number | null;
  logoPath: string | null;
  certification: string | null;
  videos: StremioMetaVideo[] | null;
};

export { tmdbApiGet } from "@/lib/tmdb-api-get";

export async function resolveTitleFromImdb(params: {
  imdbId: string;
  stremioType: "movie" | "series";
  credential: TmdbCredential;
  language: string;
}): Promise<ResolvedTitle | null> {
  const { imdbId, stremioType, credential, language } = params;

  const findUrl = new URL(`https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}`);
  findUrl.searchParams.set("external_source", "imdb_id");
  findUrl.searchParams.set("language", language);

  const findRaw = await tmdbApiGet(findUrl, credential);
  if (!findRaw) return null;
  const find = findRaw as FindResponse;

  if (stremioType === "movie") {
    const hit = find.movie_results?.[0];
    if (!hit) return null;
    const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${hit.id}`);
    detailsUrl.searchParams.set("language", language);
    detailsUrl.searchParams.set("append_to_response", "release_dates,credits");
    const detailsRaw = await tmdbApiGet(detailsUrl, credential);
    if (!detailsRaw) return null;
    const d = detailsRaw as MovieDetailsJson;
    const [logoPath, externalIds, creditsBlock] = await Promise.all([
      fetchLogoPath("movie", hit.id, credential),
      fetchExternalIds("movie", hit.id, credential),
      fetchTmdbCredits("movie", hit.id, credential, language),
    ]);
    const credits = creditsBlock ?? creditsBlockFromDetails(d);
    return mapResolved(
      imdbId,
      "movie",
      hit.id,
      d,
      logoPath,
      externalIds?.tvdb_id ?? null,
      null,
      credits,
    );
  }

  const hit = find.tv_results?.[0];
  if (!hit) return null;
  const detailsUrl = new URL(`https://api.themoviedb.org/3/tv/${hit.id}`);
  detailsUrl.searchParams.set("language", language);
  detailsUrl.searchParams.set("append_to_response", "content_ratings,aggregate_credits");
  const detailsRaw = await tmdbApiGet(detailsUrl, credential);
  if (!detailsRaw) return null;
  const d = detailsRaw as MovieDetailsJson;
  const [logoPath, externalIds, videos, creditsBlock] = await Promise.all([
    fetchLogoPath("tv", hit.id, credential),
    fetchExternalIds("tv", hit.id, credential),
    fetchTmdbSeriesVideos({
      tmdbTvId: hit.id,
      imdbId,
      credential,
      language,
    }),
    fetchTmdbCredits("tv", hit.id, credential, language),
  ]);
  const credits = creditsBlock ?? creditsBlockFromDetails(d);
  return mapResolved(
    imdbId,
    "series",
    hit.id,
    d,
    logoPath,
    externalIds?.tvdb_id ?? null,
    videos,
    credits,
  );
}

function isoDateMidnight(date: string | undefined): string | null {
  const d = date?.trim();
  if (!d) return null;
  return `${d}T00:00:00.000Z`;
}

function seriesReleaseInfo(d: MovieDetailsJson): string | undefined {
  const start = d.first_air_date?.slice(0, 4);
  const end = d.last_air_date?.slice(0, 4);
  if (!start) return undefined;
  if (d.status === "Ended" && end && end !== start) return `${start}-${end}`;
  if (d.status === "Returning Series" || d.status === "In Production") return `${start}-`;
  return start;
}

function runtimeMinutesFor(stremioType: "movie" | "series", d: MovieDetailsJson): number | null {
  if (stremioType === "movie") {
    return typeof d.runtime === "number" && d.runtime > 0 ? d.runtime : null;
  }
  const times = d.episode_run_time?.filter((n) => typeof n === "number" && n > 0) ?? [];
  if (times.length === 0) return null;
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

function primaryCountry(d: MovieDetailsJson): string | null {
  const us = d.production_countries?.find((c) => c.iso_3166_1 === "US")?.name;
  if (us?.trim()) return us.trim();
  const first = d.production_countries?.[0]?.name;
  return first?.trim() || null;
}

function mapResolved(
  imdbId: string,
  stremioType: "movie" | "series",
  tmdbNumericId: number,
  d: MovieDetailsJson,
  logoPath: string | null,
  tvdbId: number | null,
  videos: StremioMetaVideo[] | null,
  creditsBlock: TmdbCreditsBlock | null,
): ResolvedTitle {
  const releaseRaw = stremioType === "movie" ? d.release_date : d.first_air_date;
  const year = releaseRaw?.slice(0, 4);
  const genres = (d.genres ?? []).map((g) => g.name).filter(Boolean) as string[];
  const title =
    stremioType === "movie" ? (d.title ?? imdbId) : (d.name ?? d.title ?? imdbId);
  const detailsRecord = d as MovieDetailsJson & {
    release_dates?: { results?: { iso_3166_1?: string; release_dates?: { certification?: string }[] }[] };
    content_ratings?: { results?: { iso_3166_1?: string; rating?: string }[] };
  };
  let certification: string | null = null;
  if (stremioType === "movie") {
    const us = detailsRecord.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
    certification = us?.release_dates?.find((r) => r.certification)?.certification ?? null;
  } else {
    const us = detailsRecord.content_ratings?.results?.find((r) => r.iso_3166_1 === "US");
    certification = us?.rating ?? null;
  }

  const { cast, directors } = parseTmdbCredits(creditsBlock, stremioType);
  const releaseInfo =
    stremioType === "series" ? seriesReleaseInfo(d) : year;

  return {
    imdbId,
    stremioType,
    tmdbNumericId,
    title,
    overview: d.overview ?? "",
    releaseYear: year,
    releaseInfo,
    releasedIso: isoDateMidnight(releaseRaw ?? undefined),
    lastAirDateIso:
      stremioType === "series" ? isoDateMidnight(d.last_air_date ?? undefined) : null,
    status: typeof d.status === "string" ? d.status : null,
    runtimeMinutes: runtimeMinutesFor(stremioType, d),
    posterPath: d.poster_path ?? null,
    backdropPath: d.backdrop_path ?? null,
    voteAverage: typeof d.vote_average === "number" ? d.vote_average : null,
    voteCount: typeof d.vote_count === "number" ? d.vote_count : null,
    genreNames: genres,
    cast,
    directors,
    country: primaryCountry(d),
    tvdbId,
    logoPath,
    certification,
    videos,
  };
}

async function fetchExternalIds(
  kind: "movie" | "tv",
  tmdbId: number,
  credential: TmdbCredential,
): Promise<ExternalIdsJson | null> {
  const url = new URL(`https://api.themoviedb.org/3/${kind}/${tmdbId}/external_ids`);
  const raw = await tmdbApiGet(url, credential);
  if (!raw || typeof raw !== "object") return null;
  return raw as ExternalIdsJson;
}

async function fetchLogoPath(
  kind: "movie" | "tv",
  tmdbId: number,
  credential: TmdbCredential,
): Promise<string | null> {
  const url = new URL(
    `https://api.themoviedb.org/3/${kind}/${tmdbId}/images`,
  );
  const raw = await tmdbApiGet(url, credential);
  if (!raw) return null;
  const data = raw as ImagesJson;
  const logos = (data.logos ?? []).filter((l) => l.file_path?.trim());
  if (logos.length === 0) return null;

  const score = (l: LogoImageJson): number => {
    let s = l.vote_count ?? 0;
    if (l.iso_639_1 === "en") s += 50;
    else if (l.iso_639_1 == null) s += 30;
    const area = (l.width ?? 0) * (l.height ?? 0);
    if (area > 0) s += Math.min(20, Math.log10(area));
    return s;
  };

  logos.sort((a, b) => score(b) - score(a));
  return logos[0]?.file_path ?? null;
}

export async function resolveTitleForArtwork(
  imdbId: string,
  credential: TmdbCredential,
  language: string,
) {
  const findUrl = new URL(`https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}`);
  findUrl.searchParams.set("external_source", "imdb_id");
  findUrl.searchParams.set("language", language);

  const findRaw = await tmdbApiGet(findUrl, credential);
  if (!findRaw) return null;
  const find = findRaw as FindResponse;

  const movieHit = find.movie_results?.[0];
  if (movieHit) {
    const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${movieHit.id}`);
    detailsUrl.searchParams.set("language", language);
    detailsUrl.searchParams.set("append_to_response", "release_dates,credits");
    const detailsRaw = await tmdbApiGet(detailsUrl, credential);
    if (!detailsRaw) return null;
    const d = detailsRaw as MovieDetailsJson;
    const [logoPath, externalIds] = await Promise.all([
      fetchLogoPath("movie", movieHit.id, credential),
      fetchExternalIds("movie", movieHit.id, credential),
    ]);
    return mapResolved(
      imdbId,
      "movie",
      movieHit.id,
      d,
      logoPath,
      externalIds?.tvdb_id ?? null,
      null,
      null,
    );
  }

  const tvHit = find.tv_results?.[0];
  if (tvHit) {
    const detailsUrl = new URL(`https://api.themoviedb.org/3/tv/${tvHit.id}`);
    detailsUrl.searchParams.set("language", language);
    detailsUrl.searchParams.set("append_to_response", "content_ratings");
    const detailsRaw = await tmdbApiGet(detailsUrl, credential);
    if (!detailsRaw) return null;
    const d = detailsRaw as MovieDetailsJson;
    const [logoPath, externalIds] = await Promise.all([
      fetchLogoPath("tv", tvHit.id, credential),
      fetchExternalIds("tv", tvHit.id, credential),
    ]);
    return mapResolved(
      imdbId,
      "series",
      tvHit.id,
      d,
      logoPath,
      externalIds?.tvdb_id ?? null,
      null,
      null,
    );
  }

  return null;
}
