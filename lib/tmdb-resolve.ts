import type { TmdbCredential } from "@/lib/tmdb-auth";
import {
  creditsBlockFromDetails,
  parseTmdbCredits,
  type TmdbCreditsBlock,
} from "@/lib/tmdb-credits";
import type { TmdbCastMember, TmdbCreatedBy } from "@/lib/tmdb-credits-parse";
import { fetchTmdbSeriesVideos, type StremioMetaVideo } from "@/lib/tmdb-series-videos";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import { readPolisDiskJson, writePolisDiskJson } from "@/lib/polis-disk-cache";

type FindResponse = {
  movie_results?: { id: number }[];
  tv_results?: { id: number }[];
};

type MovieDetailsJson = {
  number_of_seasons?: number;
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
  created_by?: TmdbCreatedBy;
  credits?: TmdbCreditsBlock;
  aggregate_credits?: TmdbCreditsBlock;
  images?: ImagesJson;
  external_ids?: ExternalIdsJson;
};

type LogoImageJson = {
  file_path?: string;
  iso_639_1?: string | null;
  vote_count?: number;
  width?: number;
  height?: number;
};

export type TmdbPosterImage = {
  file_path?: string | null;
  iso_639_1?: string | null;
};

export type TmdbBackdropImage = TmdbPosterImage & {
  vote_average?: number | null;
};

type ImagesJson = {
  logos?: LogoImageJson[];
  posters?: TmdbPosterImage[];
  backdrops?: TmdbBackdropImage[];
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
  castMembers: TmdbCastMember[];
  directors: string[];
  country: string | null;
  tmdbNumericId: number;
  tvdbId: number | null;
  logoPath: string | null;
  certification: string | null;
  videos: StremioMetaVideo[] | null;
  posterImages?: TmdbPosterImage[];
  backdropImages?: TmdbBackdropImage[];
  logoPaths?: string[];
};

export { tmdbApiGet } from "@/lib/tmdb-api-get";

export async function resolveTitleFromImdb(params: {
  imdbId: string;
  stremioType: "movie" | "series";
  credential: TmdbCredential;
  language: string;
}): Promise<ResolvedTitle | null> {
  const { imdbId, stremioType, credential, language } = params;

  const hint = await readTmdbIdHint(imdbId);
  const tmdbId =
    hint?.stremioType === stremioType
      ? hint.tmdbId
      : await findTmdbIdForType(imdbId, stremioType, credential, language);
  if (tmdbId == null) return null;

  if (stremioType === "movie") {
    const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
    detailsUrl.searchParams.set("language", language);
    detailsUrl.searchParams.set("append_to_response", "release_dates,credits");
    const detailsRaw = await tmdbApiGet(detailsUrl, credential);
    if (!detailsRaw) return null;
    const d = detailsRaw as MovieDetailsJson;
    const [logoPath, externalIds] = await Promise.all([
      fetchLogoPath("movie", tmdbId, credential, language),
      fetchExternalIds("movie", tmdbId, credential),
    ]);
    const credits = creditsBlockFromDetails(d);
    return mapResolved(
      imdbId,
      "movie",
      tmdbId,
      d,
      logoPath,
      externalIds?.tvdb_id ?? null,
      null,
      credits,
    );
  }

  const detailsUrl = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}`);
  detailsUrl.searchParams.set("language", language);
  detailsUrl.searchParams.set("append_to_response", "content_ratings,aggregate_credits");
  const detailsRaw = await tmdbApiGet(detailsUrl, credential);
  if (!detailsRaw) return null;
  const d = detailsRaw as MovieDetailsJson;
  const [logoPath, externalIds, videos] = await Promise.all([
    fetchLogoPath("tv", tmdbId, credential, language),
    fetchExternalIds("tv", tmdbId, credential),
    fetchTmdbSeriesVideos({
      tmdbTvId: tmdbId,
      imdbId,
      credential,
      language,
      seasonCount: d.number_of_seasons ?? 0,
    }),
  ]);
  const credits = creditsBlockFromDetails(d);
  return mapResolved(
    imdbId,
    "series",
    tmdbId,
    d,
    logoPath,
    externalIds?.tvdb_id ?? null,
    videos,
    credits,
  );
}

async function findTmdbIdForType(
  imdbId: string,
  stremioType: "movie" | "series",
  credential: TmdbCredential,
  language: string,
): Promise<number | null> {
  const findUrl = new URL(`https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}`);
  findUrl.searchParams.set("external_source", "imdb_id");
  findUrl.searchParams.set("language", language);

  const findRaw = await tmdbApiGet(findUrl, credential);
  if (!findRaw) return null;
  const find = findRaw as FindResponse;
  const hit = stremioType === "movie" ? find.movie_results?.[0] : find.tv_results?.[0];
  return hit?.id ?? null;
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

  const { cast, castMembers, directors } = parseTmdbCredits(creditsBlock, stremioType, d.created_by ?? []);
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
    castMembers,
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

export const TMDB_IMAGES_TTL_SEC = 7 * 24 * 60 * 60;

export function tmdbIncludeImageLanguage(language: string): string {
  const primary = language.split("-")[0]?.trim().toLowerCase() || "en";
  return [...new Set([primary, "en", "null", "xx"])].join(",");
}

async function fetchTmdbLogos(
  kind: "movie" | "tv",
  tmdbId: number,
  credential: TmdbCredential,
  includeImageLanguage: string | null,
): Promise<LogoImageJson[]> {
  const url = new URL(`https://api.themoviedb.org/3/${kind}/${tmdbId}/images`);
  if (includeImageLanguage) url.searchParams.set("include_image_language", includeImageLanguage);
  const raw = await tmdbApiGet(url, credential, { ttlSec: TMDB_IMAGES_TTL_SEC });
  if (!raw || typeof raw !== "object") return [];
  return (raw as ImagesJson).logos ?? [];
}

async function fetchLogoPath(
  kind: "movie" | "tv",
  tmdbId: number,
  credential: TmdbCredential,
  language: string,
): Promise<string | null> {
  const preferred = await fetchTmdbLogos(kind, tmdbId, credential, tmdbIncludeImageLanguage(language));
  if (preferred.length > 0) return pickLogoPath(preferred);
  return pickLogoPath(await fetchTmdbLogos(kind, tmdbId, credential, null));
}

function pickLogoPath(rawLogos: LogoImageJson[] | undefined): string | null {
  return rankLogoPaths(rawLogos)[0] ?? null;
}

export function rankLogoPaths(rawLogos: LogoImageJson[] | undefined): string[] {
  const logos = (rawLogos ?? []).filter((l) => l.file_path?.trim());

  const score = (l: LogoImageJson): number => {
    let s = l.vote_count ?? 0;
    if (l.iso_639_1 === "en") s += 50;
    else if (l.iso_639_1 == null) s += 30;
    const area = (l.width ?? 0) * (l.height ?? 0);
    if (area > 0) s += Math.min(20, Math.log10(area));
    return s;
  };

  logos.sort((a, b) => score(b) - score(a));
  return logos.map((l) => l.file_path!);
}

export type TmdbFindHit = { stremioType: "movie" | "series"; tmdbId: number };

const TMDB_ID_HINT_NAMESPACE = "tmdb-id";
const TMDB_ID_HINT_SCOPE = "g";
export const TMDB_ID_HINT_TTL_SEC = 30 * 24 * 60 * 60;

function isTmdbFindHit(raw: unknown): raw is TmdbFindHit {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  return (
    (record.stremioType === "movie" || record.stremioType === "series") &&
    typeof record.tmdbId === "number" &&
    Number.isInteger(record.tmdbId) &&
    record.tmdbId > 0
  );
}

async function readTmdbIdHint(imdbId: string): Promise<TmdbFindHit | null> {
  const raw = await readPolisDiskJson<unknown>(
    TMDB_ID_HINT_NAMESPACE,
    TMDB_ID_HINT_SCOPE,
    imdbId,
    TMDB_ID_HINT_TTL_SEC * 1000,
  );
  return isTmdbFindHit(raw) ? { stremioType: raw.stremioType, tmdbId: raw.tmdbId } : null;
}

export async function rememberTmdbIdHint(imdbId: string, hit: TmdbFindHit): Promise<void> {
  const known = await readTmdbIdHint(imdbId);
  if (known?.stremioType === hit.stremioType && known.tmdbId === hit.tmdbId) return;
  await writePolisDiskJson(TMDB_ID_HINT_NAMESPACE, TMDB_ID_HINT_SCOPE, imdbId, {
    stremioType: hit.stremioType,
    tmdbId: hit.tmdbId,
  });
}

export async function findTmdbTitle(
  imdbId: string,
  credential: TmdbCredential,
  language: string,
): Promise<TmdbFindHit | null> {
  const hint = await readTmdbIdHint(imdbId);
  if (hint) return hint;

  const findUrl = new URL(`https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}`);
  findUrl.searchParams.set("external_source", "imdb_id");
  findUrl.searchParams.set("language", language);

  const findRaw = await tmdbApiGet(findUrl, credential);
  if (!findRaw) return null;
  const find = findRaw as FindResponse;
  const movieId = find.movie_results?.[0]?.id;
  if (typeof movieId === "number") return { stremioType: "movie", tmdbId: movieId };
  const tvId = find.tv_results?.[0]?.id;
  if (typeof tvId === "number") return { stremioType: "series", tmdbId: tvId };
  return null;
}

export async function resolveTitleForArtwork(
  imdbId: string,
  credential: TmdbCredential,
  language: string,
  knownHit?: TmdbFindHit,
): Promise<ResolvedTitle | null> {
  const hit = knownHit ?? (await findTmdbTitle(imdbId, credential, language));
  if (!hit) return null;
  const movie = hit.stremioType === "movie";
  const detailsUrl = new URL(`https://api.themoviedb.org/3/${movie ? "movie" : "tv"}/${hit.tmdbId}`);
  setArtworkAppends(detailsUrl, language, movie ? "release_dates" : "content_ratings");
  const detailsRaw = await tmdbApiGet(detailsUrl, credential);
  if (!detailsRaw) return null;
  return mapArtworkResolved(imdbId, hit.stremioType, hit.tmdbId, detailsRaw as MovieDetailsJson);
}

function setArtworkAppends(url: URL, language: string, appends: string): void {
  url.searchParams.set("language", language);
  url.searchParams.set("append_to_response", `${appends},images,external_ids`);
  url.searchParams.set("include_image_language", tmdbIncludeImageLanguage(language));
}

function mapArtworkResolved(
  imdbId: string,
  stremioType: "movie" | "series",
  tmdbId: number,
  d: MovieDetailsJson,
): ResolvedTitle {
  const resolved = mapResolved(
    imdbId,
    stremioType,
    tmdbId,
    d,
    pickLogoPath(d.images?.logos),
    d.external_ids?.tvdb_id ?? null,
    null,
    null,
  );
  return {
    ...resolved,
    posterImages: d.images?.posters ?? [],
    backdropImages: d.images?.backdrops ?? [],
    logoPaths: rankLogoPaths(d.images?.logos),
  };
}
