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

const SHAPE_PARAM = "shape";
const LANDSCAPE_SHAPE = "landscape";

function queryWithoutShape(query: string): string {
  const params = new URLSearchParams(query);
  params.delete(SHAPE_PARAM);
  return params.toString();
}

export function landscapePosterArtUrl(params: {
  publicBase: string;
  imdbId: string;
  query: string;
  configId?: string | null;
}): string {
  const base = queryWithoutShape(params.query);
  const query = base ? `${base}&${SHAPE_PARAM}=${LANDSCAPE_SHAPE}` : `${SHAPE_PARAM}=${LANDSCAPE_SHAPE}`;
  return posterArtUrl({ ...params, query });
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
  landscapePattern: string;
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
  const merged = mergePosterQueryForAiometadataPattern(queryWithoutShape(posterQueryString.trim()));
  const path = `${b}/poster/imdb/poster-default/{imdb_id}.jpg?${merged}`;
  return {
    posterPattern: `${path}&${SHAPE_PARAM}={shape}`,
    landscapePattern: `${path}&${SHAPE_PARAM}=${LANDSCAPE_SHAPE}`,
  };
}
