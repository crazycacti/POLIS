import sharp, { type OverlayOptions } from "sharp";

import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import type { PosterPillBadge } from "@/lib/poster-badges";
import { encodePosterImage } from "@/lib/poster-encode";
import { normalizeGenreLabel } from "@/lib/poster-footer-pill";
import { preparePosterLogoRaster } from "@/lib/poster-logo-on-poster";
import { compositeTopRightCluster, type QualityMarkId } from "@/lib/poster-quality-marks";
import {
  POSTER_OVERLAY_DEFAULTS,
  type LogoSize,
  type PosterOverlayQuery,
} from "@/lib/poster-query";
import {
  fitSoftText,
  measureSoftText,
  softCapHeight,
  softTextPath,
} from "@/lib/poster-soft-font";
import { ratingDisplayColor } from "@/lib/rating-colors";
import type { RatingSource } from "@/lib/ratings";
import { escapeXml } from "@/lib/xml-escape";

// Every size is a share of the poster width so the overlay keeps its proportions when clients scale the image.
const PAD_X = 0.08;
const PAD_BOTTOM = 0.055;
const PAD_TOP = 0.05;
const RING_DIAMETER = 0.17;
const RING_STROKE = 0.012;
const SCORE_FONT = 0.064;
const GENRE_FONT = 0.058;
const TREND_FONT = 0.048;
const FOOTER_GAP = 0.04;
const LOGO_GAP = 0.035;
const BLUR_BAND = 0.2;
const SCRIM_BAND = 0.38;
const TOP_SCRIM_BAND = 0.18;
const BLUR_SIGMA = 0.012;

const LOGO_WIDTH_SHARE: Record<LogoSize, number> = { small: 0.5, medium: 0.66, large: 0.8 };
const LOGO_MAX_HEIGHT_SHARE = 0.24;
const LOGO_SHADOW_SIGMA = 0.012;
const LOGO_SHADOW_OFFSET = 0.004;
const LOGO_SHADOW_ALPHA = 0.55;

const RING_TRACK = "rgba(255,255,255,0.22)";
const TEXT_PRIMARY = "#ffffff";
const TEXT_GENRE = "rgba(255,255,255,0.92)";

type Rect = { left: number; top: number; width: number; height: number };

function sizeFactor(configured: number, fallback: number): number {
  return Math.min(1.6, Math.max(0.6, configured / fallback));
}

function ringColor(
  overlay: Pick<PosterOverlayQuery, "ratingColor">,
  valueTen: number,
  source: RatingSource | null,
): string {
  if (overlay.ratingColor !== "auto") return overlay.ratingColor;
  return ratingDisplayColor(source ?? "average", valueTen);
}

function scoreLabel(valueTen: number): string {
  return valueTen >= 10 ? "10" : valueTen.toFixed(1);
}

function gradientSvg(w: number, h: number, stops: [number, number][]): Buffer {
  const stopTags = stops
    .map(([offset, alpha]) => `<stop offset="${offset}" stop-color="#000" stop-opacity="${alpha}"/>`)
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0">${stopTags}</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`,
  );
}

async function softBlurBand(baseBuf: Buffer, w: number, h: number): Promise<{ input: Buffer; top: number; left: number }> {
  const bandH = Math.round(h * BLUR_BAND);
  const top = h - bandH;
  const mask = await sharp(gradientSvg(w, bandH, [[0, 0.9], [0.5, 0.55], [1, 0]])).png().toBuffer();
  const band = await sharp(baseBuf)
    .extract({ left: 0, top, width: w, height: bandH })
    .blur(Math.max(1, w * BLUR_SIGMA))
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return { input: band, top, left: 0 };
}

// Light wordmarks vanish on snow or sky; a soft dark halo keeps them legible without a visible box.
async function logoShadow(logo: Buffer, w: number): Promise<{ input: Buffer; pad: number }> {
  const pad = Math.ceil(w * LOGO_SHADOW_SIGMA * 3);
  const alpha = await sharp(logo)
    .ensureAlpha()
    .extractChannel("alpha")
    .linear(LOGO_SHADOW_ALPHA, 0)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(Math.max(1, w * LOGO_SHADOW_SIGMA))
    .toBuffer();
  const meta = await sharp(alpha).metadata();
  const input = await sharp({
    create: { width: meta.width ?? 1, height: meta.height ?? 1, channels: 3, background: "#000000" },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return { input, pad };
}

function logoRect(params: {
  w: number;
  h: number;
  logoW: number;
  logoH: number;
  gridCell: number;
  padX: number;
  padTop: number;
  bottomLimit: number;
}): Rect {
  const row = Math.floor(params.gridCell / 3);
  const col = params.gridCell % 3;
  let left: number;
  if (col === 0) left = params.padX;
  else if (col === 2) left = params.w - params.padX - params.logoW;
  else left = Math.round((params.w - params.logoW) / 2);

  let top: number;
  if (row === 0) top = params.padTop;
  else if (row === 1) top = Math.round((params.h - params.logoH) / 2);
  else top = params.bottomLimit - params.logoH;

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: params.logoW,
    height: params.logoH,
  };
}

export async function renderSoftPoster(params: {
  imageBuffer: Buffer;
  artTextless: boolean;
  overlay: PosterOverlayQuery;
  genreNames: string[];
  ratingValueTen: number | null;
  ratingColorSource: RatingSource | null;
  trendBadges: PosterPillBadge[];
  qualityMarkIds: QualityMarkId[];
  ageBadge: PosterPillBadge | null;
  logoPath: string | null;
}): Promise<Buffer | null> {
  ensurePolisSharpConfigured();
  const { overlay } = params;

  const baseBuf = await sharp(params.imageBuffer)
    .resize(500, 750, { fit: "cover", position: "attention" })
    .toBuffer();
  const meta = await sharp(baseBuf).metadata();
  const w = meta.width ?? 500;
  const h = meta.height ?? 750;

  const padX = Math.round(w * PAD_X);
  const padBottom = Math.round(w * PAD_BOTTOM);
  const padTop = Math.round(w * PAD_TOP);

  const ringScale = sizeFactor(overlay.ratingFontSize, POSTER_OVERLAY_DEFAULTS.ratingFontSize);
  const genreScale = sizeFactor(overlay.genreFontSize, POSTER_OVERLAY_DEFAULTS.genreFontSize);
  const trendScale = sizeFactor(overlay.trendFontSize, POSTER_OVERLAY_DEFAULTS.trendFontSize);

  const valueTen = overlay.rating ? params.ratingValueTen : null;
  const showRing = valueTen != null && Number.isFinite(valueTen);
  const ringD = Math.round(w * RING_DIAMETER * ringScale);
  const ringStroke = Math.max(2, w * RING_STROKE * ringScale);
  const scoreFs = Math.round(w * SCORE_FONT * ringScale);
  const genreFs = Math.round(w * GENRE_FONT * genreScale);
  const trendFs = Math.round(w * TREND_FONT * trendScale);

  const genreRaw = overlay.genre ? normalizeGenreLabel(params.genreNames, overlay.genreMode) : null;
  const footerH = Math.max(showRing ? ringD : 0, genreRaw ? Math.round(genreFs * 1.3) : 0);
  const hasFooter = footerH > 0;
  const footerCenterY = h - padBottom - footerH / 2;

  const trendText = overlay.trendTags ? (params.trendBadges[0]?.text ?? null) : null;
  const ageLabel = overlay.ageRating ? (params.ageBadge?.text ?? null) : null;

  const layers: OverlayOptions[] = [];
  if (hasFooter || (overlay.logoOnPoster && params.logoPath)) {
    // Blurring titled art smears its own wordmark, so only textless art gets the blur band.
    if (params.artTextless) layers.push(await softBlurBand(baseBuf, w, h));
    const scrimH = Math.round(h * SCRIM_BAND);
    layers.push({
      input: gradientSvg(w, scrimH, [[0, 0.66], [0.45, 0.28], [1, 0]]),
      top: h - scrimH,
      left: 0,
    });
  }
  if (trendText) {
    const topH = Math.round(h * TOP_SCRIM_BAND);
    layers.push({
      input: gradientSvg(w, topH, [[0, 0], [1, 0.38]]),
      top: 0,
      left: 0,
    });
  }

  if (overlay.logoOnPoster && params.logoPath) {
    const maxLogoW = Math.round(w * LOGO_WIDTH_SHARE[overlay.logoSize]);
    const raster = await preparePosterLogoRaster(params.logoPath, maxLogoW);
    if (raster) {
      const maxLogoH = Math.round(h * LOGO_MAX_HEIGHT_SHARE);
      const scale = Math.min(1, maxLogoW / raster.width, maxLogoH / raster.height);
      const logoW = Math.max(1, Math.round(raster.width * scale));
      const logoH = Math.max(1, Math.round(raster.height * scale));
      const bottomLimit = hasFooter
        ? Math.round(footerCenterY - footerH / 2 - w * LOGO_GAP)
        : h - padBottom;
      const rect = logoRect({
        w,
        h,
        logoW,
        logoH,
        gridCell: overlay.gridCell,
        padX,
        padTop: trendText ? padTop + Math.round(trendFs * 1.6) : padTop,
        bottomLimit,
      });
      const logo =
        logoW === raster.width && logoH === raster.height
          ? raster.buffer
          : await sharp(raster.buffer).resize({ width: logoW, height: logoH, fit: "fill" }).png().toBuffer();
      const shadow = await logoShadow(logo, w);
      layers.push(
        {
          input: shadow.input,
          top: rect.top - shadow.pad + Math.round(w * LOGO_SHADOW_OFFSET),
          left: rect.left - shadow.pad,
        },
        { input: logo, top: rect.top, left: rect.left },
      );
    }
  }

  const svgParts: string[] = [];
  let genreRight = w - padX;
  if (showRing && valueTen != null) {
    const cx = w - padX - ringD / 2;
    const cy = footerCenterY;
    const r = (ringD - ringStroke) / 2;
    const circumference = 2 * Math.PI * r;
    const filled = Math.max(0, Math.min(1, valueTen / 10)) * circumference;
    const color = escapeXml(ringColor(overlay, valueTen, params.ratingColorSource));
    svgParts.push(
      `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="${RING_TRACK}" stroke-width="${ringStroke.toFixed(2)}"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${ringStroke.toFixed(2)}" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`,
    );
    const label = scoreLabel(valueTen);
    const x = cx - measureSoftText(label, scoreFs, 700) / 2;
    const baseline = cy + softCapHeight(scoreFs, 700) / 2;
    const placed = softTextPath(label, x, baseline, scoreFs, 700);
    if (placed) svgParts.push(`<path d="${placed.d}" fill="${TEXT_PRIMARY}"/>`);
    genreRight = cx - ringD / 2 - Math.round(w * FOOTER_GAP);
  }

  if (genreRaw) {
    const text = fitSoftText(genreRaw, genreFs, 600, genreRight - padX);
    const baseline = footerCenterY + softCapHeight(genreFs, 600) / 2;
    const placed = text ? softTextPath(text, padX, baseline, genreFs, 600) : null;
    if (placed) svgParts.push(`<path d="${placed.d}" fill="${TEXT_GENRE}"/>`);
  }

  if (trendText) {
    const text = fitSoftText(trendText, trendFs, 600, w - padX * 2);
    const baseline = padTop + softCapHeight(trendFs, 600);
    const placed = text ? softTextPath(text, padX, baseline, trendFs, 600) : null;
    if (placed) svgParts.push(`<path d="${placed.d}" fill="${TEXT_PRIMARY}"/>`);
  }

  if (svgParts.length > 0) {
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svgParts.join("")}</svg>`,
      ),
      top: 0,
      left: 0,
    });
  }

  let composed: Buffer = layers.length > 0 ? await sharp(baseBuf).composite(layers).toBuffer() : baseBuf;

  const markIds = overlay.qualityTags ? params.qualityMarkIds : [];
  if (markIds.length > 0 || ageLabel) {
    composed = await compositeTopRightCluster(
      composed,
      markIds,
      ageLabel,
      padX,
      padTop,
      overlay.qualityMarkSize,
      "right",
    );
  }

  return encodePosterImage(composed);
}
