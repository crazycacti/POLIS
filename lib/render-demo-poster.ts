import type { PosterPillBadge } from "@/lib/poster-badges";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import { loadDemoArtBuffer } from "@/lib/demo-art-cache";
import {
  demoTrendBadges,
  getDemoTitle,
  type DemoTitle,
} from "@/lib/demo-catalog";
import { resolveRatingDisplay } from "@/lib/ratings";
import { normalizeQualityMarkIds } from "@/lib/poster-quality-marks";
import { renderPosterJpeg } from "@/lib/render-poster-default";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { resolveTitleForArtwork } from "@/lib/tmdb-resolve";

function tmdbCredentialFromEnv(): TmdbCredential | null {
  const key = process.env.TMDB_API_KEY?.trim();
  if (key) return { kind: "api_key", key };
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (token) return { kind: "bearer", token };
  return null;
}

async function demoLogoPath(demo: DemoTitle, overlay: PosterOverlayQuery): Promise<string | null> {
  if (!overlay.logoOnPoster) return null;
  const credential = tmdbCredentialFromEnv();
  if (!credential) return null;
  const language = process.env.TMDB_LANGUAGE?.trim() || "en-US";
  const resolved = await resolveTitleForArtwork(demo.imdbId, credential, language);
  return resolved?.logoPath ?? null;
}

export async function renderDemoPosterJpeg(
  demoId: string,
  overlay: PosterOverlayQuery,
): Promise<Buffer | null> {
  const demo = getDemoTitle(demoId);
  if (!demo) return null;

  const art = await loadDemoArtBuffer(demoId);
  if (!art) return null;

  return renderPosterFromDemo(art, demo, overlay);
}

export async function renderPosterFromDemo(
  art: Buffer,
  demo: DemoTitle,
  overlay: PosterOverlayQuery,
): Promise<Buffer | null> {
  const logoPath = await demoLogoPath(demo, overlay);
  const ratingStyle = overlay.ratingStyle === "votes" ? "score" : overlay.ratingStyle;
  const ratingResolved = overlay.rating
    ? resolveRatingDisplay(overlay.ratingSource, demo.ratings, demo.voteAverage, ratingStyle)
    : null;
  const ratingLabel = ratingResolved?.label ?? null;
  const ratingValueTen = ratingResolved?.valueTen ?? null;

  const qualityMarkIds = overlay.qualityTags
    ? normalizeQualityMarkIds(demo.qualityMarkIds)
    : [];
  const trendBadges = overlay.trendTags ? demoTrendBadges(demo) : [];
  const ageBadge: PosterPillBadge | null =
    overlay.ageRating && demo.ageLabel ? { text: demo.ageLabel, kind: "age" } : null;

  return renderPosterJpeg({
    imageBuffer: art,
    overlay,
    genreNames: demo.genreNames,
    ratingLabel,
    ratingValueTen,
    ratingColorSource: overlay.rating ? overlay.ratingSource : null,
    voteCount: 25_000,
    trendBadges,
    qualityMarkIds,
    ageBadge,
    logoPath,
  });
}
