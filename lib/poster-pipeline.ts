import {
  fetchTmdbImagePosters,
  postersHasXxTextless,
} from "@/lib/artwork-poster";
import { getPosterBaseBufferCached } from "@/lib/poster-artwork-cache";
import { integratorCacheFingerprint } from "@/lib/integrator-cache-fingerprint";
import { fetchMdblistMediaInfo } from "@/lib/mdblist-client";
import { overlayUsesMdblist } from "@/lib/overlay-requirements";
import { buildAgeBadge, buildQualityMarkIds, buildTrendBadges } from "@/lib/poster-badges";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import { renderPosterJpeg } from "@/lib/render-poster-default";
import {
  mergeRatingScores,
  resolveRatingDisplay,
  type RatingScores,
} from "@/lib/ratings";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { resolveTitleForArtwork } from "@/lib/tmdb-resolve";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

export async function renderPosterForImdb(params: {
  imdbId: string;
  overlay: PosterOverlayQuery;
  credential: TmdbCredential;
  language: string;
  mdblistApiKey: string | null;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
  configId?: string | null;
}): Promise<Buffer | null> {
  const resolved = await resolveTitleForArtwork(params.imdbId, params.credential, params.language);
  if (!resolved) return null;

  const baseBuffer = await getPosterBaseBufferCached({
    imdbId: params.imdbId,
    overlay: params.overlay,
    resolved,
    credential: params.credential,
    language: params.language,
    fanartApiKey: params.fanartApiKey,
    tvdbCredentials: params.tvdbCredentials,
    configId: params.configId ?? null,
    integratorFingerprint: integratorCacheFingerprint({
      credential: params.credential,
      mdblistApiKey: params.mdblistApiKey,
      fanartApiKey: params.fanartApiKey,
      tvdbCredentials: params.tvdbCredentials,
    }),
  });
  if (!baseBuffer) return null;

  const needsMdblist = overlayUsesMdblist(params.overlay);

  const mdblist =
    params.mdblistApiKey && needsMdblist
      ? await fetchMdblistMediaInfo({
          imdbId: params.imdbId,
          stremioType: resolved.stremioType,
          apiKey: params.mdblistApiKey,
        })
      : null;

  const tmdbPosters =
    params.overlay.artwork === "tmdb"
      ? await fetchTmdbImagePosters(resolved, params.credential)
      : undefined;

  const scores: RatingScores = mergeRatingScores(mdblist?.ratings ?? {}, resolved.voteAverage);
  const ratingStyle = params.overlay.ratingStyle === "votes" ? "score" : params.overlay.ratingStyle;
  let ratingResolved = params.overlay.rating
    ? resolveRatingDisplay(
        params.overlay.ratingSource,
        scores,
        resolved.voteAverage,
        ratingStyle,
      )
    : null;
  if (params.overlay.rating && !ratingResolved && resolved.voteAverage != null) {
    ratingResolved = resolveRatingDisplay(
      params.overlay.ratingSource === "average" ? "tmdb" : params.overlay.ratingSource,
      scores,
      resolved.voteAverage,
      ratingStyle,
    );
  }
  const ratingLabel = ratingResolved?.label ?? null;
  const ratingValueTen = ratingResolved?.valueTen ?? null;
  const ratingColorSource = ratingResolved?.colorSource ?? null;

  const trendBadges = params.overlay.trendTags
    ? buildTrendBadges({
        resolved,
        mdblist,
        trendRank: params.overlay.trendRank,
      })
    : [];
  const qualityMarkIds = params.overlay.qualityTags ? buildQualityMarkIds(mdblist) : [];
  const ageBadge = params.overlay.ageRating
    ? buildAgeBadge(mdblist, resolved.certification)
    : null;

  let logoPath: string | null = null;
  if (params.overlay.logoOnPoster && resolved.logoPath) {
    if (params.overlay.artwork === "tmdb") {
      if (postersHasXxTextless(tmdbPosters ?? [])) logoPath = resolved.logoPath;
    } else {
      logoPath = resolved.logoPath;
    }
  }

  return renderPosterJpeg({
    imageBuffer: baseBuffer,
    overlay: params.overlay,
    genreNames: resolved.genreNames,
    ratingLabel,
    ratingValueTen,
    ratingColorSource,
    voteCount: resolved.voteCount,
    trendBadges,
    qualityMarkIds,
    ageBadge,
    logoPath,
  });
}
