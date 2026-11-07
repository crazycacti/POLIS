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
import { getPosterBaseBufferCached } from "@/lib/poster-artwork-cache";
import { renderLandscapeSoft } from "@/lib/render-landscape-soft";
import { renderPosterJpeg } from "@/lib/render-poster-default";
import { MAX_LOGO_ALTERNATES, renderSoftPoster } from "@/lib/render-poster-soft";
import { softFontAvailable } from "@/lib/poster-soft-font";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { resolveTitleForArtwork } from "@/lib/tmdb-resolve";

function tmdbCredentialFromEnv(): TmdbCredential | null {
  const key = process.env.TMDB_API_KEY?.trim();
  if (key) return { kind: "api_key", key };
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (token) return { kind: "bearer", token };
  return null;
}

function demoLanguage(): string {
  return process.env.TMDB_LANGUAGE?.trim() || "en-US";
}

async function demoLogoPaths(demo: DemoTitle, overlay: PosterOverlayQuery): Promise<string[]> {
  if (!overlay.logoOnPoster || !demo.artTextless) return [];
  const credential = tmdbCredentialFromEnv();
  if (!credential) return [];
  const resolved = await resolveTitleForArtwork(demo.imdbId, credential, demoLanguage());
  return resolved?.logoPaths ?? [];
}

async function demoLandscapeArt(
  demo: DemoTitle,
  overlay: PosterOverlayQuery,
): Promise<{ buffer: Buffer; textless: boolean; logoPaths: string[] } | null> {
  const credential = tmdbCredentialFromEnv();
  if (!credential) return null;
  const language = demoLanguage();
  const resolved = await resolveTitleForArtwork(demo.imdbId, credential, language);
  if (!resolved) return null;
  const base = await getPosterBaseBufferCached({
    imdbId: demo.imdbId,
    overlay,
    resolved,
    credential,
    language,
    fanartApiKey: null,
    tvdbCredentials: null,
    configId: null,
  });
  if (!base) return null;
  return { ...base, logoPaths: resolved.logoPaths ?? [] };
}

async function renderLandscapeFromDemo(
  portraitArt: Buffer,
  demo: DemoTitle,
  overlay: PosterOverlayQuery,
  ratingValueTen: number | null,
): Promise<Buffer> {
  const landscape = await demoLandscapeArt(demo, overlay);
  const artTextless = landscape ? landscape.textless : demo.artTextless;
  const logoPaths =
    overlay.logoOnPoster && artTextless
      ? (landscape?.logoPaths ?? (await demoLogoPaths(demo, overlay)))
      : [];
  const [logoPath = null, ...logoAlternates] = logoPaths;
  return renderLandscapeSoft({
    imageBuffer: landscape?.buffer ?? portraitArt,
    artTextless,
    overlay,
    ratingValueTen,
    ratingColorSource: overlay.rating ? overlay.ratingSource : null,
    trendBadges: overlay.trendTags ? demoTrendBadges(demo) : [],
    qualityMarkIds: overlay.qualityTags ? normalizeQualityMarkIds(demo.qualityMarkIds) : [],
    ageBadge: overlay.ageRating && demo.ageLabel ? { text: demo.ageLabel, kind: "age" } : null,
    logoPath,
    logoAlternates: logoAlternates.slice(0, MAX_LOGO_ALTERNATES),
  });
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
  const ratingStyle = overlay.ratingStyle === "votes" ? "score" : overlay.ratingStyle;
  const ratingResolved = overlay.rating
    ? resolveRatingDisplay(overlay.ratingSource, demo.ratings, demo.voteAverage, ratingStyle)
    : null;
  const ratingLabel = ratingResolved?.label ?? null;
  const ratingValueTen = ratingResolved?.valueTen ?? null;

  if (overlay.posterShape === "landscape") {
    return renderLandscapeFromDemo(art, demo, overlay, ratingValueTen);
  }

  const [logoPath = null, ...logoAlternates] = await demoLogoPaths(demo, overlay);

  const qualityMarkIds = overlay.qualityTags
    ? normalizeQualityMarkIds(demo.qualityMarkIds)
    : [];
  const trendBadges = overlay.trendTags ? demoTrendBadges(demo) : [];
  const ageBadge: PosterPillBadge | null =
    overlay.ageRating && demo.ageLabel ? { text: demo.ageLabel, kind: "age" } : null;

  if (overlay.look === "soft" && softFontAvailable()) {
    return renderSoftPoster({
      imageBuffer: art,
      artTextless: demo.artTextless,
      overlay,
      genreNames: demo.genreNames,
      ratingValueTen,
      ratingColorSource: overlay.rating ? overlay.ratingSource : null,
      trendBadges,
      qualityMarkIds,
      ageBadge,
      logoPath,
      logoAlternates: logoAlternates.slice(0, MAX_LOGO_ALTERNATES),
    });
  }

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
