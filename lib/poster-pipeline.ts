import { resolvePosterImageCandidates } from "@/lib/artwork-poster";
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
}): Promise<Buffer | null> {
  const resolved = await resolveTitleForArtwork(params.imdbId, params.credential, params.language);
  if (!resolved) return null;

  const needsMdblist = overlayUsesMdblist(params.overlay);

  const mdblist =
    params.mdblistApiKey && needsMdblist
      ? await fetchMdblistMediaInfo({
          imdbId: params.imdbId,
          stremioType: resolved.stremioType,
          apiKey: params.mdblistApiKey,
        })
      : null;

  const imageUrls = await resolvePosterImageCandidates({
    resolved,
    imdbId: params.imdbId,
    credential: params.credential,
    language: params.language,
    artworkSource: params.overlay.artwork,
    artworkMovie: params.overlay.artworkMovie,
    artworkFallback: params.overlay.artworkFallback,
    fanartApiKey: params.fanartApiKey,
    tvdbCredentials: params.tvdbCredentials,
    tvdbId: resolved.tvdbId,
    preferTextlessArtwork: params.overlay.logoOnPoster,
  });
  if (imageUrls.length === 0) return null;

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

  return renderPosterJpeg({
    imageUrls,
    overlay: params.overlay,
    genreNames: resolved.genreNames,
    ratingLabel,
    ratingValueTen,
    ratingColorSource,
    voteCount: resolved.voteCount,
    trendBadges,
    qualityMarkIds,
    ageBadge,
    logoPath: params.overlay.logoOnPoster ? resolved.logoPath : null,
  });
}
