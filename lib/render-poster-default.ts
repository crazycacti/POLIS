import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import sharp from "sharp";

import { fetchUpstream } from "@/lib/upstream-fetch";

import { trendPillFillsFromRegion } from "@/lib/poster-overlay-colors";
import type { PosterPillBadge } from "@/lib/poster-badges";
import { resolveFooterPadBottom, type PosterOverlayQuery } from "@/lib/poster-query";
import { ratingDisplayColor } from "@/lib/rating-colors";
import type { RatingSource } from "@/lib/ratings";
import { compositeTopRightCluster, type QualityMarkId } from "@/lib/poster-quality-marks";
import {
  footerPillUsesGlyphPath,
  type FooterPillMetrics,
  maxGenrePillBoxWidth,
  measureFooterPill,
  normalizeGenreLabel,
  FOOTER_PILL_LETTER_SPACING_EM,
  footerPillBox,
} from "@/lib/poster-footer-pill";
import {
  measureTrendPillBadge,
  trendPillBoxLeft,
  trendPillBoxTop,
  trendPillCornerRadius,
  trendPillFlushTopPath,
  type TrendPillMetrics,
} from "@/lib/poster-trend-pill";
import { svgFontFamilyAttr, svgOverlayFontDefs } from "@/lib/poster-overlay-font";
import {
  applyTitleLogoToPosterBuffer,
  posterLogoAboveFooterGap,
  resolvePosterLogoFooterBandTop,
} from "@/lib/poster-logo-on-poster";
import { encodePosterImage } from "@/lib/poster-encode";
import { escapeXml } from "@/lib/xml-escape";

const OVERLAY_FONT_REF = 57;

export async function renderPosterJpeg(params: {
  imageUrl?: string;
  imageUrls?: string[];
  imageBuffer?: Buffer;
  overlay: PosterOverlayQuery;
  genreNames: string[];
  ratingLabel: string | null;
  ratingValueTen: number | null;
  ratingColorSource: RatingSource | null;
  voteCount: number | null;
  trendBadges: PosterPillBadge[];
  qualityMarkIds: QualityMarkId[];
  ageBadge: PosterPillBadge | null;
  logoPath?: string | null;
}): Promise<Buffer | null> {
  ensurePolisSharpConfigured();

  const {
    imageUrl,
    imageUrls,
    imageBuffer,
    overlay,
    genreNames,
    ratingLabel,
    ratingValueTen,
    ratingColorSource,
    trendBadges,
    qualityMarkIds,
    ageBadge,
    logoPath,
  } = params;

  let input: Buffer | null = imageBuffer ?? null;
  if (!input) {
    const candidates = imageUrls ?? (imageUrl ? [imageUrl] : []);
    for (const url of candidates) {
      const imgRes = await fetchUpstream(url, { revalidateSeconds: 86400 });
      if (!imgRes.ok) continue;
      input = Buffer.from(await imgRes.arrayBuffer());
      break;
    }
  }
  if (!input) return null;
  let baseBuf = await sharp(input).resize(500, 750, { fit: "cover", position: "attention" }).toBuffer();

  const meta = await sharp(baseBuf).metadata();
  const w = meta.width ?? 500;
  const h = meta.height ?? 750;
  const edgePadX = Math.max(overlay.padX, Math.round(w * 0.028));
  const genrePadX = Math.max(8, edgePadX - 12);
  const edgePadTop = Math.max(8, Math.round(h * 0.014));
  const footerPadBottom = resolveFooterPadBottom(overlay, h);

  const hasTrendBadge = trendBadges.length > 0;
  const ageInTopRight = overlay.ageRating && ageBadge != null;
  const hasQualityTop = qualityMarkIds.length > 0 || ageInTopRight;
  const centerTrendTop = hasTrendBadge && !hasQualityTop;
  const trendMetrics =
    hasTrendBadge && trendBadges[0]
      ? measureTrendPillBadge(trendBadges[0], w, overlay.trendFontSize, centerTrendTop)
      : null;
  const trendTopActive = trendMetrics != null;
  const centerQualityTop = hasQualityTop && !trendTopActive;
  const trendPadTop = trendPillBoxTop(centerTrendTop, edgePadTop);

  if (hasQualityTop) {
    baseBuf = await compositeTopRightCluster(
      baseBuf,
      qualityMarkIds,
      ageInTopRight ? ageBadge.text : null,
      edgePadX,
      edgePadTop,
      overlay.qualityMarkSize,
      centerQualityTop ? "center" : "right",
    );
  }

  const genreRaw = buildGenreLabel(genreNames, overlay);
  const ratingText = buildRatingLabel(ratingLabel, overlay);
  const ratingFill = resolveRatingFill(overlay, ratingValueTen, ratingColorSource);

  const genreFooterFs = footerFontSize(w, overlay.genreFontSize);
  const ratingFooterFs = footerFontSize(w, overlay.ratingFontSize);

  const ratingMetricsForLayout = ratingText
    ? measureFooterPill(ratingText, ratingFooterFs)
    : null;

  const genreMetricsForLayout =
    genreRaw != null
      ? measureFooterPill(
          genreRaw,
          genreFooterFs,
          maxGenrePillBoxWidth({
            canvasWidth: w,
            edgePadX: genrePadX,
            ratingPillBoxWidth: ratingMetricsForLayout?.boxW ?? null,
          }),
        )
      : null;

  const wantsLogoOnPoster = overlay.logoOnPoster && logoPath;
  if (wantsLogoOnPoster) {
    const footerBandTop = resolvePosterLogoFooterBandTop({
      canvasH: h,
      footerPadBottom,
      genreEnabled: overlay.genre,
      ratingEnabled: overlay.rating,
      genreMetrics: genreMetricsForLayout,
      ratingMetrics: ratingMetricsForLayout,
      genreFooterFs,
      ratingFooterFs,
    });
    baseBuf = await applyTitleLogoToPosterBuffer({
      baseBuf,
      logoPath,
      canvasW: w,
      canvasH: h,
      footerBandTop,
      padBottom: footerPadBottom,
      padX: edgePadX,
      gap: footerBandTop != null ? posterLogoAboveFooterGap(h) : overlay.lineGap,
      gridCell: overlay.gridCell,
    });
  }

  const hasSvgOverlay = trendTopActive || genreRaw != null || ratingText != null;

  if (!hasSvgOverlay) {
    return encodePosterImage(baseBuf);
  }

  const trendPill =
    trendMetrics != null
      ? await trendPillFillsFromRegion(baseBuf, {
          left: trendPillBoxLeft(w, trendMetrics.boxW, centerTrendTop, edgePadX),
          top: trendPadTop,
          width: trendMetrics.boxW,
          height: trendMetrics.boxH,
        })
      : null;

  const footerPillAlpha = 0.55;

  const ratingMetrics = ratingMetricsForLayout;
  const genreMetrics = genreMetricsForLayout;
  const genreText = genreMetrics?.text ?? null;
  const hasGenreFooter = genreText != null && genreMetrics != null;
  const hasRatingFooter = ratingText != null && ratingMetrics != null;
  const centerGenreFooter = hasGenreFooter && !hasRatingFooter;
  const centerRatingFooter = hasRatingFooter && !hasGenreFooter;

  let genrePill: { bg: string; text: string } | null = null;
  if (genreText && genreMetrics) {
    const genreBoxLeft = centerGenreFooter
      ? Math.round((w - genreMetrics.boxW) / 2)
      : genrePadX;
    genrePill = await trendPillFillsFromRegion(
      baseBuf,
      footerPillBox(genreMetrics, h, footerPadBottom, genreBoxLeft),
      footerPillAlpha,
    );
    if (overlay.genreColor !== "auto") {
      genrePill = {
        bg: solidColorWithAlpha(overlay.genreColor, footerPillAlpha),
        text: textColorOnSolidBackground(overlay.genreColor),
      };
    }
  }

  let ratingPill: { bg: string; text: string } | null = null;
  let ratingTextFill: string | null = null;
  if (ratingText && ratingMetrics) {
    const metrics = ratingMetrics;
    const ratingBoxLeft = centerRatingFooter
      ? Math.round((w - metrics.boxW) / 2)
      : w - edgePadX - metrics.boxW;
    ratingPill = await trendPillFillsFromRegion(
      baseBuf,
      footerPillBox(metrics, h, footerPadBottom, ratingBoxLeft),
      footerPillAlpha,
    );
    if (overlay.ratingColor !== "auto") {
      ratingPill = {
        bg: solidColorWithAlpha(overlay.ratingColor, footerPillAlpha),
        text: textColorOnSolidBackground(overlay.ratingColor),
      };
      ratingTextFill = ratingPill.text;
    } else if (overlay.ratingColors) {
      ratingTextFill = ratingFill;
    } else {
      ratingTextFill = ratingPill.text;
    }
  }

  const svg = buildOverlaySvg({
    w,
    h,
    padX: edgePadX,
    genrePadX,
    padTop: edgePadTop,
    footerPadBottom,
    centerTrendTop,
    trendMetrics,
    trendPadTop,
    centerGenreFooter,
    centerRatingFooter,
    genreFontSize: overlay.genreFontSize,
    ratingFontSize: overlay.ratingFontSize,
    trendBadges,
    trendPill,
    genreText,
    genreMetrics,
    genrePill,
    ratingText,
    ratingMetrics,
    ratingPill,
    ratingTextFill,
  });

  const composited = await sharp(baseBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .toBuffer();
  return encodePosterImage(composited);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function textColorOnSolidBackground(color: string): string {
  const hex = color.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#f5f5f5";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 132 ? "#0c0c0c" : "#f5f5f5";
}

function solidColorWithAlpha(color: string, alpha: number): string {
  const hex = color.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return `rgba(255,255,255,${alpha})`;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildGenreLabel(
  genreNames: string[],
  overlay: Pick<PosterOverlayQuery, "genre" | "genreMode">,
): string | null {
  if (!overlay.genre) return null;
  return normalizeGenreLabel(genreNames, overlay.genreMode);
}

function buildRatingLabel(
  ratingLabel: string | null,
  overlay: Pick<PosterOverlayQuery, "rating">,
): string | null {
  if (!overlay.rating || !ratingLabel) return null;
  const trimmed = ratingLabel.trim();
  return trimmed || null;
}

function resolveRatingFill(
  overlay: Pick<PosterOverlayQuery, "ratingColor" | "ratingColors">,
  valueTen: number | null,
  colorSource: RatingSource | null,
): string {
  if (
    overlay.ratingColors &&
    valueTen != null &&
    colorSource &&
    overlay.ratingColor === "auto"
  ) {
    return ratingDisplayColor(colorSource, valueTen);
  }
  return overlay.ratingColor === "auto" ? "#ffffff" : overlay.ratingColor;
}

function scaledOverlayFontSize(
  canvasW: number,
  configuredSize: number,
  widthRatio: number,
  minNominal: number,
  maxNominal: number,
): number {
  const nominal = clamp(Math.round(canvasW * widthRatio), minNominal, maxNominal);
  return clamp(Math.round(nominal * (configuredSize / OVERLAY_FONT_REF)), 18, 72);
}

function footerFontSize(canvasW: number, configuredSize: number): number {
  return scaledOverlayFontSize(canvasW, configuredSize, 0.076, 30, 42);
}

function footerPillCornerRadius(boxW: number, boxH: number): number {
  return Math.min(boxW, boxH) / 2;
}

function renderTrendPill(
  metrics: TrendPillMetrics,
  boxLeft: number,
  boxTop: number,
  flushTop: boolean,
  pill: { bg: string; text: string },
): string {
  const { boxW, boxH, textPath, textOffsetX, textOffsetY } = metrics;
  const shape = flushTop
    ? `<path d="${trendPillFlushTopPath(boxLeft, boxTop, boxW, boxH)}" fill="${escapeXml(pill.bg)}" />`
    : `<rect x="${boxLeft}" y="${boxTop}" width="${boxW}" height="${boxH}" rx="${trendPillCornerRadius(boxW, boxH)}" fill="${escapeXml(pill.bg)}" />`;
  const textX = boxLeft + textOffsetX;
  const textY = boxTop + textOffsetY;
  return `${shape}
  <path d="${textPath}" fill="${escapeXml(pill.text)}" transform="translate(${textX} ${textY})" />`;
}

function renderFooterPill(
  metrics: FooterPillMetrics,
  boxLeft: number,
  canvasH: number,
  padBottom: number,
  pill: { bg: string; text: string },
  textFill: string,
): string {
  const { boxW, boxH } = metrics;
  const boxTop = canvasH - padBottom - boxH;
  const rx = footerPillCornerRadius(boxW, boxH);
  const shape = `<rect x="${boxLeft}" y="${boxTop}" width="${boxW}" height="${boxH}" rx="${rx}" fill="${escapeXml(pill.bg)}" />`;

  if (footerPillUsesGlyphPath(metrics)) {
    const textX = boxLeft + (metrics.textOffsetX ?? 0);
    const textY = boxTop + (metrics.textOffsetY ?? 0);
    return `${shape}
  <path d="${metrics.textPath}" fill="${escapeXml(textFill)}" transform="translate(${textX} ${textY})" />`;
  }

  const textY = boxTop + boxH / 2;
  const textX = boxLeft + boxW / 2;
  const safe = escapeXml(metrics.text);
  return `${shape}
  <text x="${textX}" y="${textY}" dominant-baseline="central" font-size="${metrics.fontSize}" ${svgFontFamilyAttr()} font-weight="600" fill="${escapeXml(textFill)}" text-anchor="middle" letter-spacing="${FOOTER_PILL_LETTER_SPACING_EM}em">${safe}</text>`;
}

function buildOverlaySvg(params: {
  w: number;
  h: number;
  padX: number;
  genrePadX: number;
  padTop: number;
  footerPadBottom: number;
  centerTrendTop: boolean;
  trendMetrics: TrendPillMetrics | null;
  trendPadTop: number;
  centerGenreFooter: boolean;
  centerRatingFooter: boolean;
  genreFontSize: number;
  ratingFontSize: number;
  trendBadges: PosterPillBadge[];
  trendPill: { bg: string; text: string } | null;
  genreText: string | null;
  genreMetrics: FooterPillMetrics | null;
  genrePill: { bg: string; text: string } | null;
  ratingText: string | null;
  ratingMetrics: FooterPillMetrics | null;
  ratingPill: { bg: string; text: string } | null;
  ratingTextFill: string | null;
}): string {
  const {
    w,
    h,
    padX,
    genrePadX,
    padTop,
    footerPadBottom,
    centerTrendTop,
    trendMetrics,
    trendPadTop,
    centerGenreFooter,
    centerRatingFooter,
    genreFontSize,
    ratingFontSize,
    trendBadges,
    trendPill,
    genreText,
    genreMetrics,
    genrePill,
    ratingText,
    ratingMetrics,
    ratingPill,
    ratingTextFill,
  } = params;

  let trend = "";
  if (trendBadges.length > 0 && trendPill && trendMetrics) {
    const boxLeft = trendPillBoxLeft(w, trendMetrics.boxW, centerTrendTop, padX);
    trend = renderTrendPill(trendMetrics, boxLeft, trendPadTop, centerTrendTop, trendPill);
  }

  let genre = "";
  if (genreText && genrePill && genreMetrics) {
    const boxLeft = centerGenreFooter
      ? Math.round((w - genreMetrics.boxW) / 2)
      : genrePadX;
    genre = renderFooterPill(genreMetrics, boxLeft, h, footerPadBottom, genrePill, genrePill.text);
  }

  let rating = "";
  if (ratingText && ratingPill && ratingMetrics && ratingTextFill) {
    const boxLeft = centerRatingFooter
      ? Math.round((w - ratingMetrics.boxW) / 2)
      : w - padX - ratingMetrics.boxW;
    rating = renderFooterPill(
      ratingMetrics,
      boxLeft,
      h,
      footerPadBottom,
      ratingPill,
      ratingTextFill,
    );
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  ${svgOverlayFontDefs()}
  ${trend}
  ${genre}
  ${rating}
</svg>`;
}
