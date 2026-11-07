import { effectiveArtworkSource } from "@/lib/artwork-poster";
import { getPosterBaseBufferCached } from "@/lib/poster-artwork-cache";
import { integratorCacheFingerprint } from "@/lib/integrator-cache-fingerprint";
import { fetchMdblistMediaInfo, type MdblistMediaInfo } from "@/lib/mdblist-client";
import { overlayUsesMdblist } from "@/lib/overlay-requirements";
import { withPolisRenderLimit } from "@/lib/polis-render-limit";
import { prefetchPosterLogo, type PrefetchedPosterLogo } from "@/lib/poster-logo-on-poster";
import { buildAgeBadge, buildQualityMarkIds, buildTrendBadges } from "@/lib/poster-badges";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import { renderLandscapeSoft } from "@/lib/render-landscape-soft";
import { renderPosterJpeg } from "@/lib/render-poster-default";
import { MAX_LOGO_ALTERNATES, renderSoftPoster } from "@/lib/render-poster-soft";
import { softFontAvailable } from "@/lib/poster-soft-font";
import {
  mergeRatingScores,
  resolveRatingDisplay,
  type RatingScores,
} from "@/lib/ratings";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { findTmdbTitle, resolveTitleForArtwork } from "@/lib/tmdb-resolve";
import { resolveTitleLogoRefs, titleLogoSourceOrder } from "@/lib/title-logo";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

export async function renderPosterForImdb(params: {
  imdbId: string;
  overlay: PosterOverlayQuery;
  credential: TmdbCredential;
  language: string;
  mdblistApiKey: string | null;
  mdblistServerKeyProfile?: string | null;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
  configId?: string | null;
  onDegraded?: (retryAt?: number) => void;
}): Promise<Buffer | null> {
  const hit = await findTmdbTitle(params.imdbId, params.credential, params.language);
  if (!hit) return null;

  const needsMdblist = overlayUsesMdblist(params.overlay);
  const mdblistPromise: Promise<MdblistMediaInfo | null> =
    params.mdblistApiKey && needsMdblist
      ? fetchMdblistMediaInfo({
          imdbId: params.imdbId,
          stremioType: hit.stremioType,
          apiKey: params.mdblistApiKey,
          serverKeyProfile: params.mdblistServerKeyProfile ?? null,
        }).then((lookup) => {
          if (lookup.degraded) params.onDegraded?.(lookup.retryAt);
          return lookup.info;
        }, (error: unknown) => {
          console.warn(`[polis] mdblist lookup failed for ${params.imdbId}`, error);
          params.onDegraded?.();
          return null;
        })
      : Promise.resolve(null);

  const resolved = await resolveTitleForArtwork(
    params.imdbId,
    params.credential,
    params.language,
    hit,
  );
  if (!resolved) return null;

  const logoOrder = titleLogoSourceOrder(
    effectiveArtworkSource(resolved, params.overlay.artwork, params.overlay.artworkMovie),
    params.overlay.logoSources,
  );
  const tmdbLogoPath =
    params.overlay.logoOnPoster && logoOrder[0] === "tmdb" ? resolved.logoPath : null;
  const logoPrefetch: { current: PrefetchedPosterLogo | null } = { current: null };
  const prefetchLogoForTextlessArt = (textless: boolean): void => {
    if (textless && tmdbLogoPath && !logoPrefetch.current) {
      logoPrefetch.current = prefetchPosterLogo(tmdbLogoPath);
    }
  };

  const base = await getPosterBaseBufferCached({
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
    onArtCandidate: prefetchLogoForTextlessArt,
  });
  if (!base) return null;
  const prefetchedLogo = logoPrefetch.current;
  if (base.degraded) params.onDegraded?.();

  const mdblist = await mdblistPromise;

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

  const logos =
    params.overlay.logoOnPoster && base.textless
      ? await resolveTitleLogoRefs({
          resolved,
          order: logoOrder,
          language: params.language,
          fanartApiKey: params.fanartApiKey,
          tvdbCredentials: params.tvdbCredentials,
        })
      : null;
  if (logos?.degraded) params.onDegraded?.();
  const [logoPath = null, ...otherLogos] = logos?.refs ?? [];
  const logoAlternates = otherLogos.slice(0, MAX_LOGO_ALTERNATES);

  const primaryLogo =
    logoPath == null ? null : prefetchedLogo?.path === logoPath ? prefetchedLogo : prefetchPosterLogo(logoPath);
  if (primaryLogo) await primaryLogo.png.catch(() => null);

  if (params.overlay.posterShape === "landscape" && softFontAvailable()) {
    return withPolisRenderLimit(() =>
      renderLandscapeSoft({
        imageBuffer: base.buffer,
        artTextless: base.textless,
        overlay: params.overlay,
        ratingValueTen,
        ratingColorSource,
        trendBadges,
        qualityMarkIds,
        ageBadge,
        logoPath,
        logoAlternates,
        prefetchedLogo: primaryLogo,
      }),
    );
  }

  if (softFontAvailable()) {
    return withPolisRenderLimit(() =>
      renderSoftPoster({
        imageBuffer: base.buffer,
        artTextless: base.textless,
        overlay: params.overlay,
        genreNames: resolved.genreNames,
        ratingValueTen,
        ratingColorSource,
        trendBadges,
        qualityMarkIds,
        ageBadge,
        logoPath,
        logoAlternates,
        prefetchedLogo: primaryLogo,
      }),
    );
  }

  return withPolisRenderLimit(() =>
    renderPosterJpeg({
      imageBuffer: base.buffer,
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
      prefetchedLogo: primaryLogo,
    }),
  );
}
