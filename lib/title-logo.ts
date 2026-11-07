import { fetchFanartLogos } from "@/lib/fanart-client";
import {
  TITLE_LOGO_SOURCES,
  titleLogoSourceList,
  type PosterArtworkMovieSource,
  type PosterArtworkSource,
  type TitleLogoSource,
} from "@/lib/poster-query";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";
import { fetchTvdbSeriesLogos } from "@/lib/tvdb-client";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

export function titleLogoSourceOrder(
  artSource: PosterArtworkSource | PosterArtworkMovieSource,
  logoSources: string,
): TitleLogoSource[] {
  const explicit = titleLogoSourceList(logoSources);
  if (explicit) return explicit;
  if (artSource === "tvdb" || artSource === "fanart") {
    return [artSource, ...TITLE_LOGO_SOURCES.filter((source) => source !== artSource)];
  }
  return [...TITLE_LOGO_SOURCES];
}

type TitleLogoContext = {
  resolved: ResolvedTitle;
  language: string;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
};

type TitleLogoLookup = { urls: string[]; degraded: boolean };

const NO_LOGOS: TitleLogoLookup = { urls: [], degraded: false };

function tmdbLogos(resolved: ResolvedTitle): string[] {
  if (resolved.logoPaths?.length) return resolved.logoPaths;
  return resolved.logoPath ? [resolved.logoPath] : [];
}

async function logosFrom(source: TitleLogoSource, ctx: TitleLogoContext): Promise<TitleLogoLookup> {
  const { resolved } = ctx;
  if (source === "tmdb") return { urls: tmdbLogos(resolved), degraded: false };

  if (source === "fanart") {
    if (!ctx.fanartApiKey) return NO_LOGOS;
    return fetchFanartLogos({
      mediaType: resolved.stremioType,
      tmdbId: resolved.tmdbNumericId,
      tvdbId: resolved.tvdbId,
      apiKey: ctx.fanartApiKey,
      language: ctx.language,
    });
  }

  if (resolved.stremioType !== "series" || !resolved.tvdbId || !ctx.tvdbCredentials) return NO_LOGOS;
  return fetchTvdbSeriesLogos({
    tvdbId: resolved.tvdbId,
    credentials: ctx.tvdbCredentials,
    language: ctx.language,
  });
}

export async function resolveTitleLogoRefs(
  ctx: TitleLogoContext & { order: readonly TitleLogoSource[] },
): Promise<{ refs: string[]; degraded: boolean }> {
  let degraded = false;
  for (const source of ctx.order) {
    try {
      const lookup = await logosFrom(source, ctx);
      if (lookup.degraded) degraded = true;
      if (lookup.urls.length > 0) return { refs: lookup.urls, degraded };
    } catch (error) {
      console.warn(`[polis] ${source} title logo lookup failed for ${ctx.resolved.imdbId}`, error);
      degraded = true;
    }
  }
  return { refs: [], degraded };
}
