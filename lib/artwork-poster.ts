import { fetchAnilistPosterUrl } from "@/lib/anilist-client";
import type { ArtworkCandidate } from "@/lib/artwork-candidate";
import type { AnimeSearchContext } from "@/lib/anime-artwork-match";
import { fetchFanartPoster } from "@/lib/fanart-client";
import { fetchJikanPosterUrl } from "@/lib/jikan-client";
import { fetchKitsuPosterUrl } from "@/lib/kitsu-client";
import { metahubPosterUrl, metahubPosterUrls } from "@/lib/metahub-poster";
import type {
  PosterArtworkFallback,
  PosterArtworkMovieSource,
  PosterArtworkSource,
} from "@/lib/poster-query";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";
import { fetchTvdbSeriesPoster } from "@/lib/tvdb-client";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

const TMDB_POSTER_BASE_URL = "https://image.tmdb.org/t/p/w780";

type TmdbImageRow = {
  file_path?: string | null;
  iso_639_1?: string | null;
};

function isTextlessTmdbPoster(row: TmdbImageRow): boolean {
  return Boolean(row.file_path) && (!row.iso_639_1 || row.iso_639_1 === "xx");
}

export function pickTmdbPosterPath(
  posters: TmdbImageRow[],
  language: string,
  preferTextless = false,
): string | null {
  if (!posters.length) return null;
  const lang = language.split("-")[0]?.toLowerCase() ?? "en";

  if (preferTextless) {
    const textless = posters.filter(isTextlessTmdbPoster);
    // TMDB tags most textless posters with no language; xx stays first because it is set on purpose.
    const pick = textless.find((p) => p.iso_639_1 === "xx") ?? textless[0];
    if (pick?.file_path) return pick.file_path;
    return pickTmdbPosterPath(posters, language, false);
  }

  const localized = posters.find((p) => p.iso_639_1 === lang && p.file_path);
  if (localized?.file_path) return localized.file_path;

  const anyTitled = posters.find(
    (p) => p.file_path && p.iso_639_1 && p.iso_639_1 !== "xx",
  );
  if (anyTitled?.file_path) return anyTitled.file_path;

  const textless = posters.find(isTextlessTmdbPoster);
  if (textless?.file_path) return textless.file_path;

  return posters.find((p) => p.file_path)?.file_path ?? null;
}

export async function fetchTmdbImagePosters(
  resolved: ResolvedTitle,
  credential: TmdbCredential,
): Promise<TmdbImageRow[]> {
  if (resolved.posterImages) return resolved.posterImages;
  const kind = resolved.stremioType === "movie" ? "movie" : "tv";
  const url = new URL(`https://api.themoviedb.org/3/${kind}/${resolved.tmdbNumericId}/images`);
  const raw = await tmdbApiGet(url, credential);
  if (!raw || typeof raw !== "object") return [];
  return (raw as { posters?: TmdbImageRow[] }).posters ?? [];
}

function pickTmdbImagesPosterPath(
  posters: TmdbImageRow[],
  language: string,
  preferTextless: boolean,
): string | null {
  return pickTmdbPosterPath(posters, language, preferTextless);
}

async function resolveTmdbPoster(
  resolved: ResolvedTitle,
  credential: TmdbCredential,
  language: string,
  preferTextless: boolean,
  tmdbPosters?: TmdbImageRow[] | null,
): Promise<ArtworkCandidate | null> {
  const posters =
    tmdbPosters ?? (await fetchTmdbImagePosters(resolved, credential));
  const tmdbFromImages = pickTmdbImagesPosterPath(posters, language, preferTextless);
  const tmdbPath = tmdbFromImages ?? resolved.posterPath;
  if (!tmdbPath) return null;
  const textless = posters.some((p) => p.file_path === tmdbPath && isTextlessTmdbPoster(p));
  return { url: `${TMDB_POSTER_BASE_URL}${tmdbPath}`, textless };
}

function untexted(url: string | null): ArtworkCandidate | null {
  return url ? { url, textless: false } : null;
}

type ArtworkResolveContext = {
  resolved: ResolvedTitle;
  imdbId: string;
  credential: TmdbCredential;
  language: string;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
  tvdbId: number | null;
  preferTextlessArtwork: boolean;
  tmdbPosters?: TmdbImageRow[] | null;
};

async function resolveFanartPoster(ctx: ArtworkResolveContext): Promise<ArtworkCandidate | null> {
  if (!ctx.fanartApiKey) return null;
  return fetchFanartPoster({
    mediaType: ctx.resolved.stremioType,
    tmdbId: ctx.resolved.tmdbNumericId,
    tvdbId: ctx.tvdbId,
    apiKey: ctx.fanartApiKey,
    language: ctx.language,
    preferTextless: ctx.preferTextlessArtwork,
  });
}

function animeContext(resolved: ResolvedTitle): AnimeSearchContext {
  return { title: resolved.title, releaseYear: resolved.releaseYear };
}

async function urlForArtworkSource(
  source: PosterArtworkSource | PosterArtworkFallback | PosterArtworkMovieSource,
  ctx: ArtworkResolveContext,
): Promise<ArtworkCandidate | null> {
  if (source === "metahub") {
    return untexted(metahubPosterUrl(ctx.imdbId));
  }

  if (source === "tmdb") {
    return resolveTmdbPoster(
      ctx.resolved,
      ctx.credential,
      ctx.language,
      ctx.preferTextlessArtwork,
      ctx.tmdbPosters,
    );
  }

  if (source === "fanart") {
    return (
      (await resolveFanartPoster(ctx)) ??
      resolveTmdbPoster(
        ctx.resolved,
        ctx.credential,
        ctx.language,
        ctx.preferTextlessArtwork,
        ctx.tmdbPosters,
      )
    );
  }

  if (source === "tvdb") {
    if (ctx.resolved.stremioType !== "series") return null;
    if (!ctx.tvdbId || !ctx.tvdbCredentials) return null;
    return fetchTvdbSeriesPoster({
      tvdbId: ctx.tvdbId,
      credentials: ctx.tvdbCredentials,
      language: ctx.language,
      preferTextless: ctx.preferTextlessArtwork,
    });
  }

  if (source === "anilist") {
    return untexted(await fetchAnilistPosterUrl(animeContext(ctx.resolved)));
  }

  if (source === "kitsu") {
    return untexted(await fetchKitsuPosterUrl(animeContext(ctx.resolved)));
  }

  if (source === "mal") {
    return untexted(await fetchJikanPosterUrl(animeContext(ctx.resolved)));
  }

  const fanart = await resolveFanartPoster(ctx);
  if (fanart) return fanart;
  return resolveTmdbPoster(
    ctx.resolved,
    ctx.credential,
    ctx.language,
    ctx.preferTextlessArtwork,
    ctx.tmdbPosters,
  );
}

async function urlForArtworkSourceSafe(
  source: PosterArtworkSource | PosterArtworkFallback | PosterArtworkMovieSource,
  ctx: ArtworkResolveContext,
): Promise<ArtworkCandidate | null> {
  try {
    return await urlForArtworkSource(source, ctx);
  } catch (error) {
    console.warn(`[polis] artwork source ${source} failed for ${ctx.imdbId}`, error);
    return null;
  }
}

function dedupeCandidates(candidates: ArtworkCandidate[]): ArtworkCandidate[] {
  const seen = new Set<string>();
  const out: ArtworkCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...candidate, url: key });
  }
  return out;
}

function effectiveArtworkSource(
  resolved: ResolvedTitle,
  artworkSource: PosterArtworkSource,
  artworkMovie: PosterArtworkMovieSource,
): PosterArtworkSource | PosterArtworkMovieSource {
  if (artworkSource === "tvdb" && resolved.stremioType === "movie") {
    return artworkMovie;
  }
  return artworkSource;
}

export async function resolvePosterImageCandidates(params: {
  resolved: ResolvedTitle;
  imdbId: string;
  credential: TmdbCredential;
  language: string;
  artworkSource: PosterArtworkSource;
  artworkMovie: PosterArtworkMovieSource;
  artworkFallback: PosterArtworkFallback;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
  tvdbId: number | null;
  preferTextlessArtwork?: boolean;
  tmdbPosters?: TmdbImageRow[] | null;
}): Promise<ArtworkCandidate[]> {
  const ctx: ArtworkResolveContext = {
    resolved: params.resolved,
    imdbId: params.imdbId,
    credential: params.credential,
    language: params.language,
    fanartApiKey: params.fanartApiKey,
    tvdbCredentials: params.tvdbCredentials,
    tvdbId: params.tvdbId,
    preferTextlessArtwork: params.preferTextlessArtwork ?? false,
    tmdbPosters: params.tmdbPosters,
  };

  const urls: ArtworkCandidate[] = [];
  const source = effectiveArtworkSource(
    params.resolved,
    params.artworkSource,
    params.artworkMovie,
  );

  const primary = await urlForArtworkSourceSafe(source, ctx);
  if (primary) urls.push(primary);

  if (ctx.preferTextlessArtwork && source !== "tmdb") {
    const tmdbTextless = await urlForArtworkSourceSafe("tmdb", {
      ...ctx,
      preferTextlessArtwork: true,
    });
    if (tmdbTextless?.textless) {
      urls.unshift(tmdbTextless);
    }
  }

  const fb = params.artworkFallback;
  if (fb !== source && fb !== params.artworkSource) {
    const fallback = await urlForArtworkSourceSafe(fb, ctx);
    if (fallback) urls.push(fallback);
  }

  if (fb === "metahub") {
    for (const alt of metahubPosterUrls(params.imdbId)) {
      urls.push({ url: alt, textless: false });
    }
  }

  return dedupeCandidates(urls);
}
