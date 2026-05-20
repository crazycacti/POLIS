import { mergePosterQueryForAiometadataPattern } from "@/lib/integrator-auth";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import { serializePosterQuery } from "@/lib/poster-query";

export function normalizePublicBase(base: string): string {
  return base.trim().replace(/\/$/, "");
}

export function posterArtUrl(params: {
  publicBase: string;
  imdbId: string;
  query: PosterOverlayQuery | string;
  configId?: string | null;
}): string {
  const b = normalizePublicBase(params.publicBase);
  const qs =
    typeof params.query === "string"
      ? params.query.trim()
      : serializePosterQuery(params.query);
  const path = params.configId
    ? `/${params.configId}/poster/imdb/poster-default/${params.imdbId}.jpg`
    : `/poster/imdb/poster-default/${params.imdbId}.jpg`;
  return qs ? `${b}${path}?${qs}` : `${b}${path}`;
}

export function backdropArtUrl(
  publicBase: string,
  imdbId: string,
  configId?: string | null,
): string {
  const b = normalizePublicBase(publicBase);
  const path = configId
    ? `/${configId}/backdrop/imdb/default/${imdbId}.jpg`
    : `/backdrop/imdb/default/${imdbId}.jpg`;
  return `${b}${path}`;
}

export function logoArtUrl(publicBase: string, imdbId: string, configId?: string | null): string {
  const b = normalizePublicBase(publicBase);
  const path = configId
    ? `/${configId}/logo/imdb/default/${imdbId}.png`
    : `/logo/imdb/default/${imdbId}.png`;
  return `${b}${path}`;
}

export type AiometadataPatternSet = {
  posterPattern: string;
};

export function examplePosterUrl(publicBase: string, imdbId = "tt0111161"): string {
  const b = normalizePublicBase(publicBase);
  return `${b}/poster/imdb/poster-default/${imdbId}.jpg`;
}

export function aiometadataArtPatterns(
  publicBase: string,
  posterQueryString: string,
): AiometadataPatternSet {
  const b = normalizePublicBase(publicBase);
  const posterMerged = mergePosterQueryForAiometadataPattern(posterQueryString.trim());
  const posterSuffix = posterMerged ? `?${posterMerged}` : "";
  return {
    posterPattern: `${b}/poster/imdb/poster-default/{imdb_id}.jpg${posterSuffix}`,
  };
}
