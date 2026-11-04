import sharp, { type OverlayOptions } from "sharp";

import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import type { PosterPillBadge } from "@/lib/poster-badges";
import { encodePosterImage } from "@/lib/poster-encode";
import { normalizeGenreLabel } from "@/lib/poster-footer-pill";
import { regionBadgeBackground } from "@/lib/poster-overlay-colors";
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
const GENRE_FONT = 0.046;
const TREND_FONT = 0.048;
const FOOTER_GAP = 0.04;
const LOGO_GAP = 0.035;
const BLUR_BAND = 0.2;
const SCRIM_BAND = 0.38;
const BLUR_SIGMA = 0.012;

const LOGO_WIDTH_SHARE: Record<LogoSize, number> = { small: 0.5, medium: 0.66, large: 0.8 };
const LOGO_MAX_HEIGHT_SHARE = 0.24;
const LOGO_SHADOW_SIGMA = 0.012;
const LOGO_SHADOW_OFFSET = 0.004;
const LOGO_SHADOW_ALPHA = 0.55;
// WCAG 1.4.11 asks for 3:1 on meaningful graphics.
const LOGO_MIN_CONTRAST = 3;
const LIGHT_LOGO_LUMINANCE = 0.4;
const LOGO_BACKDROP_PERCENTILE = 0.75;
const LOGO_MIN_LEGIBLE_SHARE = 0.6;
const LOGO_SCRIM_MAX_ALPHA = 0.6;
const LOGO_SCRIM_PAD = 0.06;
const LOGO_SCRIM_SIGMA = 0.03;

const RING_TRACK = "rgba(255,255,255,0.22)";
const RING_DISC = "rgba(0,0,0,0.38)";
const CAPSULE_HEIGHT = 1.85;
const CAPSULE_PAD_X = 0.62;
const CAPSULE_ALPHA = 0.86;
// White text needs 4.5:1, which holds while the fill stays under this luminance.
const CAPSULE_MAX_LUMINANCE = 0.12;
const TEXT_PRIMARY = "#ffffff";

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

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function pixelLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

type LogoSample = {
  logoLum: Float64Array;
  weight: Float64Array;
  backdropLum: Float64Array;
  meanLogoLum: number;
  backdropHigh: number;
};

async function sampleLogo(logo: Buffer, base: Buffer, rect: Rect): Promise<LogoSample> {
  const [logoRaw, backRaw] = await Promise.all([
    sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(base).extract(rect).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const count = rect.width * rect.height;
  const logoLum = new Float64Array(count);
  const weight = new Float64Array(count);
  const backdropLum = new Float64Array(count);
  const bc = backRaw.info.channels;
  let sum = 0;
  let total = 0;
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    const j = p * bc;
    backdropLum[p] = pixelLuminance(backRaw.data[j]!, backRaw.data[j + 1]!, backRaw.data[j + 2]!);
    const a = logoRaw.data[i + 3]! / 255;
    if (a === 0) continue;
    logoLum[p] = pixelLuminance(logoRaw.data[i]!, logoRaw.data[i + 1]!, logoRaw.data[i + 2]!);
    weight[p] = a;
    sum += logoLum[p]! * a;
    total += a;
  }
  // Thin letters vanish where the art is locally bright, so a high percentile beats the mean.
  const sorted = Float64Array.from(backdropLum).sort();
  const backdropHigh = sorted[Math.min(count - 1, Math.floor(count * LOGO_BACKDROP_PERCENTILE))] ?? 0;
  return { logoLum, weight, backdropLum, meanLogoLum: total > 0 ? sum / total : 0, backdropHigh };
}

function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Share of the logo's ink that clears 3:1 against the art directly behind it, after any scrim.
export function logoLegibleShare(
  sample: Pick<LogoSample, "logoLum" | "weight" | "backdropLum">,
  scrimAlpha: number,
): number {
  let legible = 0;
  let total = 0;
  for (let p = 0; p < sample.weight.length; p++) {
    const a = sample.weight[p]!;
    if (a === 0) continue;
    total += a;
    if (contrastRatio(sample.logoLum[p]!, sample.backdropLum[p]! * (1 - scrimAlpha)) >= LOGO_MIN_CONTRAST) {
      legible += a;
    }
  }
  return total > 0 ? legible / total : 0;
}

export function logoScrimAlpha(logoLum: number, backdropLum: number): number {
  if (logoLum < LIGHT_LOGO_LUMINANCE) return 0;
  const maxBackdrop = (logoLum + 0.05) / LOGO_MIN_CONTRAST - 0.05;
  if (backdropLum <= maxBackdrop) return 0;
  return Math.min(LOGO_SCRIM_MAX_ALPHA, 1 - Math.max(0, maxBackdrop) / backdropLum);
}

function logoScrim(rect: Rect, w: number, h: number, alpha: number): { input: Buffer; top: number; left: number } {
  const pad = Math.round(w * LOGO_SCRIM_PAD);
  const left = Math.max(0, rect.left - pad);
  const top = Math.max(0, rect.top - pad);
  const width = Math.min(w, rect.left + rect.width + pad) - left;
  const height = Math.min(h, rect.top + rect.height + pad) - top;
  const inset = Math.round(pad / 2);
  return {
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(w * LOGO_SCRIM_SIGMA).toFixed(2)}"/></filter><rect x="${inset}" y="${inset}" width="${Math.max(1, width - inset * 2)}" height="${Math.max(1, height - inset * 2)}" rx="${inset}" fill="#000" fill-opacity="${alpha.toFixed(3)}" filter="url(#b)"/></svg>`,
    ),
    top,
    left,
  };
}

async function capsuleFill(base: Buffer, rect: Rect): Promise<string> {
  const { r, g, b } = await regionBadgeBackground(base, rect);
  const lum = pixelLuminance(r, g, b);
  const k = lum > CAPSULE_MAX_LUMINANCE ? (CAPSULE_MAX_LUMINANCE / lum) ** (1 / 2.4) : 1;
  return `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${CAPSULE_ALPHA})`;
}

type Capsule = { text: string; rect: Rect; fs: number };

function capsuleAt(text: string, fs: number, left: number, centerY: number, maxW: number): Capsule | null {
  const padX = Math.round(fs * CAPSULE_PAD_X);
  const fitted = fitSoftText(text, fs, 600, maxW - padX * 2);
  if (!fitted) return null;
  const height = Math.round(fs * CAPSULE_HEIGHT);
  const width = Math.round(measureSoftText(fitted, fs, 600) + padX * 2);
  return { text: fitted, fs, rect: { left, top: Math.round(centerY - height / 2), width, height } };
}

async function capsuleSvg(base: Buffer, capsule: Capsule): Promise<string[]> {
  const { rect, fs, text } = capsule;
  const fill = await capsuleFill(base, rect);
  const parts = [
    `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" rx="${(rect.height / 2).toFixed(2)}" fill="${fill}"/>`,
  ];
  const baseline = rect.top + rect.height / 2 + softCapHeight(fs, 600) / 2;
  const placed = softTextPath(text, rect.left + Math.round(fs * CAPSULE_PAD_X), baseline, fs, 600);
  if (placed) parts.push(`<path d="${placed.d}" fill="${TEXT_PRIMARY}"/>`);
  return parts;
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
  logoAlternates?: string[];
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
  const footerH = Math.max(showRing ? ringD : 0, genreRaw ? Math.round(genreFs * CAPSULE_HEIGHT) : 0);
  const hasFooter = footerH > 0;
  const footerCenterY = h - padBottom - footerH / 2;

  const trendText = overlay.trendTags ? (params.trendBadges[0]?.text ?? null) : null;
  const ageLabel = overlay.ageRating ? (params.ageBadge?.text ?? null) : null;

  const drawLogo = overlay.logoOnPoster && params.logoPath != null;
  const layers: OverlayOptions[] = [];
  if (drawLogo) {
    // Blurring titled art smears its own wordmark, so only textless art gets the blur band.
    if (params.artTextless) layers.push(await softBlurBand(baseBuf, w, h));
  }
  if (hasFooter || drawLogo) {
    // The ring and capsules carry their own fills, so without a logo the shade only softens the edge.
    const strength = drawLogo ? 1 : 0.55;
    const scrimH = Math.round(h * SCRIM_BAND);
    layers.push({
      input: gradientSvg(w, scrimH, [[0, 0.66 * strength], [0.45, 0.28 * strength], [1, 0]]),
      top: h - scrimH,
      left: 0,
    });
  }

  const trendCapsule = trendText ? capsuleAt(trendText, trendFs, padX, padTop + Math.round((trendFs * CAPSULE_HEIGHT) / 2), w - padX * 2) : null;

  if (drawLogo && params.logoPath) {
    const maxLogoW = Math.round(w * LOGO_WIDTH_SHARE[overlay.logoSize]);
    const maxLogoH = Math.round(h * LOGO_MAX_HEIGHT_SHARE);
    const bottomLimit = hasFooter
      ? Math.round(footerCenterY - footerH / 2 - w * LOGO_GAP)
      : h - padBottom;
    const logoPadTop = trendCapsule
      ? trendCapsule.rect.top + trendCapsule.rect.height + Math.round(w * LOGO_GAP)
      : padTop;

    const placeLogo = async (path: string) => {
      const raster = await preparePosterLogoRaster(path, maxLogoW);
      if (!raster) return null;
      const scale = Math.min(1, maxLogoW / raster.width, maxLogoH / raster.height);
      const logoW = Math.max(1, Math.min(w, Math.round(raster.width * scale)));
      const logoH = Math.max(1, Math.min(h, Math.round(raster.height * scale)));
      const placed = logoRect({ w, h, logoW, logoH, gridCell: overlay.gridCell, padX, padTop: logoPadTop, bottomLimit });
      const rect = {
        ...placed,
        left: Math.min(placed.left, w - logoW),
        top: Math.min(placed.top, h - logoH),
      };
      const logo =
        logoW === raster.width && logoH === raster.height
          ? raster.buffer
          : await sharp(raster.buffer).resize({ width: logoW, height: logoH, fit: "fill" }).png().toBuffer();
      const sample = await sampleLogo(logo, baseBuf, rect);
      const scrimAlpha = logoScrimAlpha(sample.meanLogoLum, sample.backdropHigh);
      return { logo, rect, scrimAlpha, share: logoLegibleShare(sample, scrimAlpha) };
    };

    // Some wordmarks are dark or two-tone by design; when the top pick fades into the art, try the next one.
    let chosen: Awaited<ReturnType<typeof placeLogo>> = null;
    for (const path of [params.logoPath, ...(params.logoAlternates ?? [])]) {
      const candidate = await placeLogo(path);
      if (!candidate) continue;
      if (!chosen || candidate.share > chosen.share) chosen = candidate;
      if (candidate.share >= LOGO_MIN_LEGIBLE_SHARE) break;
    }

    if (chosen) {
      const { logo, rect, scrimAlpha } = chosen;
      const shadow = await logoShadow(logo, w);
      if (scrimAlpha > 0) layers.push(logoScrim(rect, w, h, scrimAlpha));
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
      `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="${RING_DISC}" stroke="${RING_TRACK}" stroke-width="${ringStroke.toFixed(2)}"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${ringStroke.toFixed(2)}" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`,
    );
    const label = scoreLabel(valueTen);
    const x = cx - measureSoftText(label, scoreFs, 700) / 2;
    const baseline = cy + softCapHeight(scoreFs, 700) / 2;
    const placed = softTextPath(label, x, baseline, scoreFs, 700);
    if (placed) svgParts.push(`<path d="${placed.d}" fill="${TEXT_PRIMARY}"/>`);
    genreRight = cx - ringD / 2 - Math.round(w * FOOTER_GAP);
  }

  const genreCapsule = genreRaw ? capsuleAt(genreRaw, genreFs, padX, footerCenterY, genreRight - padX) : null;
  const capsules = [genreCapsule, trendCapsule].filter((c): c is Capsule => c != null);
  for (const parts of await Promise.all(capsules.map((c) => capsuleSvg(baseBuf, c)))) {
    svgParts.push(...parts);
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
