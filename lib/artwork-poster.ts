import { fetchAnilistPosterUrl } from "@/lib/anilist-client";
import type { AnimeSearchContext } from "@/lib/anime-artwork-match";
import { fetchFanartPosterUrl } from "@/lib/fanart-client";
import { fetchJikanPosterUrl } from "@/lib/jikan-client";
import { fetchKitsuPosterUrl } from "@/lib/kitsu-client";
import { metahubPosterUrl, metahubPosterUrls } from "@/lib/metahub-poster";
import type {
  PosterArtworkFallback,
  PosterArtworkMovieSource,
  PosterArtworkSource,
} from "@/lib/poster-query";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { fetchUpstream } from "@/lib/upstream-fetch";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";
import { fetchTvdbSeriesPosterUrl } from "@/lib/tvdb-client";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

type TmdbImageRow = {
  file_path?: string | null;
  iso_639_1?: string | null;
};

async function tmdbGetJson(url: URL, credential: TmdbCredential): Promise<unknown> {
  const target = new URL(url.toString());
  const headers: Record<string, string> = { Accept: "application/json" };
  if (credential.kind === "api_key") {
    target.searchParams.set("api_key", credential.key);
  } else {
    headers.Authorization = `Bearer ${credential.token}`;
  }
  const response = await fetchUpstream(target, { headers, revalidateSeconds: 86400 });
  if (!response.ok) return null;
  return response.json();
}

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
    const textless = posters.find(isTextlessTmdbPoster);
    if (textless?.file_path) return textless.file_path;
    return posters.find((p) => p.file_path)?.file_path ?? null;
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

async function fetchTmdbImagesPosterPath(
  resolved: ResolvedTitle,
  credential: TmdbCredential,
  language: string,
  preferTextless: boolean,
): Promise<string | null> {
  const kind = resolved.stremioType === "movie" ? "movie" : "tv";
  const url = new URL(`https://api.themoviedb.org/3/${kind}/${resolved.tmdbNumericId}/images`);
  const raw = await tmdbGetJson(url, credential);
  if (!raw || typeof raw !== "object") return null;
  const posters = (raw as { posters?: TmdbImageRow[] }).posters ?? [];
  return pickTmdbPosterPath(posters, language, preferTextless);
}

async function resolveTmdbPosterUrl(
  resolved: ResolvedTitle,
  credential: TmdbCredential,
  language: string,
  preferTextless: boolean,
): Promise<string | null> {
  const tmdbFromImages = await fetchTmdbImagesPosterPath(
    resolved,
    credential,
    language,
    preferTextless,
  );
  const tmdbPath = tmdbFromImages ?? resolved.posterPath;
  return tmdbPath ? `https://image.tmdb.org/t/p/w780${tmdbPath}` : null;
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
};

async function resolveFanartUrl(ctx: ArtworkResolveContext): Promise<string | null> {
  if (!ctx.fanartApiKey) return null;
  return fetchFanartPosterUrl({
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
): Promise<string | null> {
  if (source === "metahub") {
    return metahubPosterUrl(ctx.imdbId);
  }

  if (source === "tmdb") {
    return resolveTmdbPosterUrl(
      ctx.resolved,
      ctx.credential,
      ctx.language,
      ctx.preferTextlessArtwork,
    );
  }

  if (source === "fanart") {
    return (
      (await resolveFanartUrl(ctx)) ??
      resolveTmdbPosterUrl(ctx.resolved, ctx.credential, ctx.language, ctx.preferTextlessArtwork)
    );
  }

  if (source === "tvdb") {
    if (ctx.resolved.stremioType !== "series") return null;
    if (!ctx.tvdbId || !ctx.tvdbCredentials) return null;
    return fetchTvdbSeriesPosterUrl({
      tvdbId: ctx.tvdbId,
      credentials: ctx.tvdbCredentials,
      language: ctx.language,
      preferTextless: ctx.preferTextlessArtwork,
    });
  }

  if (source === "anilist") {
    return fetchAnilistPosterUrl(animeContext(ctx.resolved));
  }

  if (source === "kitsu") {
    return fetchKitsuPosterUrl(animeContext(ctx.resolved));
  }

  if (source === "mal") {
    return fetchJikanPosterUrl(animeContext(ctx.resolved));
  }

  const fanart = await resolveFanartUrl(ctx);
  if (fanart) return fanart;
  return resolveTmdbPosterUrl(
    ctx.resolved,
    ctx.credential,
    ctx.language,
    ctx.preferTextlessArtwork,
  );
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const key = u.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
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
}): Promise<string[]> {
  const ctx: ArtworkResolveContext = {
    resolved: params.resolved,
    imdbId: params.imdbId,
    credential: params.credential,
    language: params.language,
    fanartApiKey: params.fanartApiKey,
    tvdbCredentials: params.tvdbCredentials,
    tvdbId: params.tvdbId,
    preferTextlessArtwork: params.preferTextlessArtwork ?? false,
  };

  const urls: string[] = [];
  const source = effectiveArtworkSource(
    params.resolved,
    params.artworkSource,
    params.artworkMovie,
  );

  const primary = await urlForArtworkSource(source, ctx);
  if (primary) urls.push(primary);

  if (ctx.preferTextlessArtwork && source !== "tmdb") {
    const tmdbTextless = await resolveTmdbPosterUrl(
      ctx.resolved,
      ctx.credential,
      ctx.language,
      true,
    );
    if (tmdbTextless) {
      urls.unshift(tmdbTextless);
    }
  }

  const fb = params.artworkFallback;
  if (fb !== source && fb !== params.artworkSource) {
    const fallback = await urlForArtworkSource(fb, ctx);
    if (fallback) urls.push(fallback);
  }

  if (fb === "metahub") {
    for (const alt of metahubPosterUrls(params.imdbId)) {
      urls.push(alt);
    }
  }

  return dedupeUrls(urls);
}
