import type { TmdbCredential } from "@/lib/tmdb-auth";
import {
  creditsBlockFromDetails,
  parseTmdbCredits,
  type TmdbCreditsBlock,
} from "@/lib/tmdb-credits";
import type { TmdbCastMember, TmdbCreatedBy } from "@/lib/tmdb-credits-parse";
import { fetchTmdbSeriesVideos, type StremioMetaVideo } from "@/lib/tmdb-series-videos";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import { polisCacheRoot } from "@/lib/polis-cache-path";
import { polisDiskCacheEnabled, readPolisDiskJsonEntry, writePolisDiskJson } from "@/lib/polis-disk-cache";

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
  partial?: boolean;
};

export { tmdbApiGet } from "@/lib/tmdb-api-get";

export async function resolveTitleFromImdb(params: {
  imdbId: string;
  stremioType: "movie" | "series";
  credential: TmdbCredential;
  language: string;
}): Promise<ResolvedTitle | null> {
  const { imdbId, stremioType, credential, language } = params;

  const hinted = await readTmdbIdHint(imdbId, stremioType);
  let tmdbId = hinted ?? (await findTmdbIdForType(imdbId, stremioType, credential, language));
  if (tmdbId == null) return null;

  const metaDetails = (id: number) => {
    const detailsUrl = new URL(`https://api.themoviedb.org/3/${stremioType === "movie" ? "movie" : "tv"}/${id}`);
    detailsUrl.searchParams.set("language", language);
    detailsUrl.searchParams.set(
      "append_to_response",
      stremioType === "movie" ? "release_dates,credits" : "content_ratings,aggregate_credits",
    );
    return tmdbApiGet(detailsUrl, credential);
  };
  let detailsRaw = await metaDetails(tmdbId);
  if (!detailsRaw && hinted != null) {
    const refreshed = await findTmdbIdForType(imdbId, stremioType, credential, language);
    if (refreshed != null && refreshed !== tmdbId) {
      tmdbId = refreshed;
      detailsRaw = await metaDetails(tmdbId);
    }
  }
  if (!detailsRaw) return null;

  if (stremioType === "movie") {
    const d = detailsRaw as MovieDetailsJson;
    const [logo, externalIds] = await Promise.all([
      optionalLookup(fetchLogoPath("movie", tmdbId, credential, language)),
      optionalLookup(fetchExternalIds("movie", tmdbId, credential)),
    ]);
    const credits = creditsBlockFromDetails(d);
    return {
      ...mapResolved(
        imdbId,
        "movie",
        tmdbId,
        d,
        logo.value,
        externalIds.value?.tvdb_id ?? null,
        null,
        credits,
      ),
      partial: logo.failed || externalIds.failed,
    };
  }

  const d = detailsRaw as MovieDetailsJson;
  const [logo, externalIds, videos] = await Promise.all([
    optionalLookup(fetchLogoPath("tv", tmdbId, credential, language)),
    optionalLookup(fetchExternalIds("tv", tmdbId, credential)),
    fetchTmdbSeriesVideos({
      tmdbTvId: tmdbId,
      imdbId,
      credential,
      language,
      seasonCount: d.number_of_seasons ?? 0,
    }),
  ]);
  const credits = creditsBlockFromDetails(d);
  return {
    ...mapResolved(
      imdbId,
      "series",
      tmdbId,
      d,
      logo.value,
      externalIds.value?.tvdb_id ?? null,
      videos,
      credits,
    ),
    partial: logo.failed || externalIds.failed,
  };
}

type OptionalLookup<T> = { value: T | null; failed: boolean };

async function optionalLookup<T>(lookup: Promise<T | null>): Promise<OptionalLookup<T>> {
  try {
    return { value: await lookup, failed: false };
  } catch {
    return { value: null, failed: true };
  }
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
  if ((d.status === "Ended" || d.status === "Canceled") && end && end !== start) {
    return `${start}-${end}`;
  }
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
    stremioType === "movie" ? d.title?.trim() || imdbId : d.name?.trim() || d.title?.trim() || imdbId;
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
    voteAverage:
      typeof d.vote_average === "number" && d.vote_average > 0 && (d.vote_count ?? 0) > 0
        ? d.vote_average
        : null,
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
const TMDB_ID_HINT_KEY_VERSION = "typed";
const UNTYPED_LOOKUP_ORDER: TmdbFindHit["stremioType"][] = ["movie", "series"];
export const TMDB_ID_HINT_TTL_SEC = 30 * 24 * 60 * 60;
const TMDB_ID_HINT_TTL_MS = TMDB_ID_HINT_TTL_SEC * 1000;

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

const TMDB_ID_HINT_MEMORY_MAX = 20_000;
const tmdbIdHintMemory = new Map<string, { tmdbId: number; expiresAt: number }>();

function tmdbIdHintDiskKey(imdbId: string, stremioType: TmdbFindHit["stremioType"]): string {
  return [TMDB_ID_HINT_KEY_VERSION, stremioType, imdbId].join("\0");
}

function tmdbIdHintMemoryKey(imdbId: string, stremioType: TmdbFindHit["stremioType"]): string {
  return `${polisCacheRoot()}\0${tmdbIdHintDiskKey(imdbId, stremioType)}`;
}

function rememberTmdbIdHintInMemory(imdbId: string, hit: TmdbFindHit, storedAt: number): void {
  if (!polisDiskCacheEnabled()) return;
  const key = tmdbIdHintMemoryKey(imdbId, hit.stremioType);
  tmdbIdHintMemory.delete(key);
  tmdbIdHintMemory.set(key, { tmdbId: hit.tmdbId, expiresAt: storedAt + TMDB_ID_HINT_TTL_MS });
  if (tmdbIdHintMemory.size > TMDB_ID_HINT_MEMORY_MAX) {
    const oldest = tmdbIdHintMemory.keys().next().value;
    if (oldest !== undefined) tmdbIdHintMemory.delete(oldest);
  }
}

async function readTmdbIdHint(imdbId: string, stremioType: TmdbFindHit["stremioType"]): Promise<number | null> {
  const key = tmdbIdHintMemoryKey(imdbId, stremioType);
  const remembered = tmdbIdHintMemory.get(key);
  if (remembered && remembered.expiresAt > Date.now()) return remembered.tmdbId;
  if (remembered) tmdbIdHintMemory.delete(key);
  const entry = await readPolisDiskJsonEntry(
    TMDB_ID_HINT_NAMESPACE,
    TMDB_ID_HINT_SCOPE,
    tmdbIdHintDiskKey(imdbId, stremioType),
    TMDB_ID_HINT_TTL_MS,
  );
  if (!entry || !isTmdbFindHit(entry.value) || entry.value.stremioType !== stremioType) return null;
  rememberTmdbIdHintInMemory(imdbId, { stremioType, tmdbId: entry.value.tmdbId }, entry.mtimeMs);
  return entry.value.tmdbId;
}

export async function rememberTmdbIdHint(imdbId: string, hit: TmdbFindHit): Promise<void> {
  if ((await readTmdbIdHint(imdbId, hit.stremioType)) === hit.tmdbId) return;
  await writePolisDiskJson(TMDB_ID_HINT_NAMESPACE, TMDB_ID_HINT_SCOPE, tmdbIdHintDiskKey(imdbId, hit.stremioType), {
    stremioType: hit.stremioType,
    tmdbId: hit.tmdbId,
  });
  rememberTmdbIdHintInMemory(imdbId, hit, Date.now());
}

function rememberFoundTmdbTitle(imdbId: string, hit: TmdbFindHit): TmdbFindHit {
  void rememberTmdbIdHint(imdbId, hit).catch((error: unknown) =>
    console.warn(`[polis] tmdb id hint write failed for ${imdbId}`, error),
  );
  return hit;
}

async function findTmdbResults(imdbId: string, credential: TmdbCredential, language: string): Promise<FindResponse | null> {
  const findUrl = new URL(`https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}`);
  findUrl.searchParams.set("external_source", "imdb_id");
  findUrl.searchParams.set("language", language);
  const findRaw = await tmdbApiGet(findUrl, credential);
  return findRaw ? (findRaw as FindResponse) : null;
}

function findResultId(find: FindResponse, stremioType: TmdbFindHit["stremioType"]): number | null {
  const id = (stremioType === "movie" ? find.movie_results : find.tv_results)?.[0]?.id;
  return typeof id === "number" ? id : null;
}

async function findTmdbIdForType(
  imdbId: string,
  stremioType: TmdbFindHit["stremioType"],
  credential: TmdbCredential,
  language: string,
): Promise<number | null> {
  const find = await findTmdbResults(imdbId, credential, language);
  const tmdbId = find ? findResultId(find, stremioType) : null;
  if (tmdbId != null) rememberFoundTmdbTitle(imdbId, { stremioType, tmdbId });
  return tmdbId;
}

export async function findTmdbTitle(
  imdbId: string,
  credential: TmdbCredential,
  language: string,
): Promise<TmdbFindHit | null> {
  for (const stremioType of UNTYPED_LOOKUP_ORDER) {
    const tmdbId = await readTmdbIdHint(imdbId, stremioType);
    if (tmdbId != null) return { stremioType, tmdbId };
  }
  const find = await findTmdbResults(imdbId, credential, language);
  if (!find) return null;
  for (const stremioType of UNTYPED_LOOKUP_ORDER) {
    const tmdbId = findResultId(find, stremioType);
    if (tmdbId != null) return rememberFoundTmdbTitle(imdbId, { stremioType, tmdbId });
  }
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
  const artworkDetails = (tmdbId: number) => {
    const movie = hit.stremioType === "movie";
    const detailsUrl = new URL(`https://api.themoviedb.org/3/${movie ? "movie" : "tv"}/${tmdbId}`);
    setArtworkAppends(detailsUrl, language, movie ? "release_dates" : "content_ratings");
    return tmdbApiGet(detailsUrl, credential);
  };
  let tmdbId = hit.tmdbId;
  let detailsRaw = await artworkDetails(tmdbId);
  if (!detailsRaw) {
    const refreshed = await findTmdbIdForType(imdbId, hit.stremioType, credential, language);
    if (refreshed == null || refreshed === tmdbId) return null;
    tmdbId = refreshed;
    detailsRaw = await artworkDetails(tmdbId);
    if (!detailsRaw) return null;
  }
  return mapArtworkResolved(imdbId, hit.stremioType, tmdbId, detailsRaw as MovieDetailsJson);
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
