import {
  mergePosterQueryForConfigurePreview,
  mergePosterQueryWithIntegratorAuth,
  type IntegratorArtworkKeys,
  type ServerIntegratorKeyAvailability,
} from "@/lib/integrator-auth";
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
  backgroundPattern: string;
  logoPattern: string;
};

export function examplePosterUrl(publicBase: string, imdbId = "tt0111161"): string {
  const b = normalizePublicBase(publicBase);
  return `${b}/poster/imdb/poster-default/${imdbId}.jpg`;
}

function tmdbArtworkAuthSuffix(artworkAuth?: URLSearchParams): string {
  const qs = artworkAuth?.toString().trim();
  return qs ? `?${qs}` : "";
}

export function aiometadataArtPatterns(
  publicBase: string,
  posterQueryString: string,
  artworkAuth?: URLSearchParams,
  artworkKeys?: IntegratorArtworkKeys,
  serverKeys?: ServerIntegratorKeyAvailability,
): AiometadataPatternSet {
  const b = normalizePublicBase(publicBase);
  const posterMerged = serverKeys
    ? mergePosterQueryForConfigurePreview(
        posterQueryString.trim(),
        serverKeys,
        artworkAuth,
        artworkKeys ?? {},
      )
    : mergePosterQueryWithIntegratorAuth(
        posterQueryString.trim(),
        artworkAuth,
        artworkKeys,
      );
  const posterSuffix = posterMerged ? `?${posterMerged}` : "";
  const artworkAuthSuffix = tmdbArtworkAuthSuffix(artworkAuth);
  return {
    posterPattern: `${b}/poster/imdb/poster-default/{imdb_id}.jpg${posterSuffix}`,
    backgroundPattern: `${b}/backdrop/imdb/default/{imdb_id}.jpg${artworkAuthSuffix}`,
    logoPattern: `${b}/logo/imdb/default/{imdb_id}.png${artworkAuthSuffix}`,
  };
}
