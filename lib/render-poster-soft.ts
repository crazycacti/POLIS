import sharp, { type OverlayOptions } from "sharp";

import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import type { PosterPillBadge } from "@/lib/poster-badges";
import { encodePosterImage, INTERMEDIATE_PNG } from "@/lib/poster-encode";
import { normalizeGenreLabel } from "@/lib/poster-footer-pill";
import { regionBadgeBackground } from "@/lib/poster-overlay-colors";
import { preparePosterLogoRaster, type PrefetchedPosterLogo } from "@/lib/poster-logo-on-poster";
import {
  loadMarkGlyph,
  normalizeQualityMarkIds,
  type QualityMarkId,
} from "@/lib/poster-quality-marks";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import {
  fitSoftText,
  measureSoftText,
  softCapHeight,
  softTextPath,
} from "@/lib/poster-soft-font";
import { LOGO_GAP_SHARE, labelTextPx, logoMaxBox, scoreTextPx, textSizeFactor } from "@/lib/poster-type-scale";
import { ratingDisplayColor } from "@/lib/rating-colors";
import type { RatingSource } from "@/lib/ratings";
import { escapeXml } from "@/lib/xml-escape";

const POSTER_WIDTH = 500;
const POSTER_HEIGHT = 750;
const PAD_X = 0.08;
const PAD_BOTTOM = 0.055;
const PAD_TOP = 0.05;
export const RING_DIAMETER = 0.17;
export const RING_STROKE = 0.012;
const FOOTER_GAP = 0.04;
export const TOP_ITEM_GAP = 0.5;
const TOP_ROW_MIN_SCALE = 0.75;
const TOP_ROW_SCALE_STEP = 0.05;
const DOLBY_GLYPH_HEIGHT = 0.9;

const MARK_TEXT: Partial<Record<QualityMarkId, string>> = {
  "4k": "4K",
  "1080p": "1080p",
  "720p": "720p",
  hdr: "HDR",
};
const MARK_ORDER: QualityMarkId[] = ["4k", "1080p", "720p", "dolby", "hdr"];
const BLUR_BAND = 0.2;
const SCRIM_BAND = 0.38;
const BLUR_SIGMA = 0.012;

const LOGO_SHADOW_SIGMA = 0.012;
export const LOGO_SHADOW_OFFSET = 0.004;
const LOGO_SHADOW_ALPHA = 0.55;
const LOGO_MIN_CONTRAST = 3;
const LIGHT_LOGO_LUMINANCE = 0.4;
const LOGO_BACKDROP_PERCENTILE = 0.75;
export const LOGO_MIN_LEGIBLE_SHARE = 0.6;
export const MAX_LOGO_ALTERNATES = 2;
const LOGO_SCRIM_MAX_ALPHA = 0.6;
const LOGO_SCRIM_PAD = 0.06;
const LOGO_SCRIM_SIGMA = 0.03;

const RING_TRACK = "rgba(255,255,255,0.22)";
const RING_DISC = "rgba(0,0,0,0.38)";
export const CAPSULE_HEIGHT = 1.85;
export const CAPSULE_PAD_X = 0.62;
const CAPSULE_ALPHA = 0.86;
const TAB_HEIGHT = 1.95;
const TAB_RADIUS = 0.34;
const CAPSULE_MAX_LUMINANCE = 0.12;
const CAPSULE_DARKEN = 0.45;
const TEXT_PRIMARY = "#ffffff";

export type Rect = { left: number; top: number; width: number; height: number };

export function ringColor(
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

export function ratingRingSvg(params: {
  cx: number;
  cy: number;
  diameter: number;
  stroke: number;
  valueTen: number;
  color: string;
  scoreFs: number;
}): string[] {
  const { cx, cy, stroke, valueTen, scoreFs } = params;
  const r = (params.diameter - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, valueTen / 10)) * circumference;
  const color = escapeXml(params.color);
  const parts = [
    `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="${RING_DISC}" stroke="${RING_TRACK}" stroke-width="${stroke.toFixed(2)}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${stroke.toFixed(2)}" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`,
  ];
  const label = scoreLabel(valueTen);
  const x = cx - measureSoftText(label, scoreFs, 700) / 2;
  const baseline = cy + softCapHeight(scoreFs, 700) / 2;
  const placed = softTextPath(label, x, baseline, scoreFs, 700);
  if (placed) parts.push(`<path d="${placed.d}" fill="${TEXT_PRIMARY}"/>`);
  return parts;
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
  const mask = await sharp(gradientSvg(w, bandH, [[0, 0.9], [0.5, 0.55], [1, 0]])).png(INTERMEDIATE_PNG).toBuffer();
  const band = await sharp(baseBuf)
    .extract({ left: 0, top, width: w, height: bandH })
    .blur(Math.max(1, w * BLUR_SIGMA))
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png(INTERMEDIATE_PNG)
    .toBuffer();
  return { input: band, top, left: 0 };
}

export async function logoShadow(logo: Buffer, w: number): Promise<{ input: Buffer; pad: number }> {
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
    .png(INTERMEDIATE_PNG)
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

export async function sampleLogo(logo: Buffer, base: Buffer, rect: Rect): Promise<LogoSample> {
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
  const sorted = Float64Array.from(backdropLum).sort();
  const backdropHigh = sorted[Math.min(count - 1, Math.floor(count * LOGO_BACKDROP_PERCENTILE))] ?? 0;
  return { logoLum, weight, backdropLum, meanLogoLum: total > 0 ? sum / total : 0, backdropHigh };
}

function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

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

export function logoScrim(
  rect: Rect,
  w: number,
  h: number,
  alpha: number,
  scaleRef = w,
): { input: Buffer; top: number; left: number } {
  const blur = scaleRef * LOGO_SCRIM_SIGMA;
  const inset = Math.round(scaleRef * LOGO_SCRIM_PAD / 2);
  const pad = inset + Math.ceil(blur * 3);
  const left = Math.max(0, rect.left - pad);
  const top = Math.max(0, rect.top - pad);
  const width = Math.min(w, rect.left + rect.width + pad) - left;
  const height = Math.min(h, rect.top + rect.height + pad) - top;
  const rx = rect.left - left - inset;
  const ry = rect.top - top - inset;
  return {
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur.toFixed(2)}"/></filter><rect x="${rx}" y="${ry}" width="${rect.width + inset * 2}" height="${rect.height + inset * 2}" rx="${inset}" fill="#000" fill-opacity="${alpha.toFixed(3)}" filter="url(#b)"/></svg>`,
    ),
    top,
    left,
  };
}

async function capsuleFill(base: Buffer, rect: Rect): Promise<string> {
  const { r, g, b } = await regionBadgeBackground(base, rect);
  const lum = pixelLuminance(r, g, b);
  const target = Math.min(CAPSULE_MAX_LUMINANCE, lum * CAPSULE_DARKEN);
  const k = lum > 0 ? (target / lum) ** (1 / 2.4) : 1;
  return `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${CAPSULE_ALPHA})`;
}

export type Capsule = { text: string; rect: Rect; fs: number; tab: boolean };

export function capsuleAt(text: string, fs: number, left: number, centerY: number, maxW: number): Capsule | null {
  const padX = Math.round(fs * CAPSULE_PAD_X);
  const fitted = fitSoftText(text, fs, 600, maxW - padX * 2);
  if (!fitted) return null;
  const height = Math.round(fs * CAPSULE_HEIGHT);
  const width = Math.round(measureSoftText(fitted, fs, 600) + padX * 2);
  return { text: fitted, fs, tab: false, rect: { left, top: Math.round(centerY - height / 2), width, height } };
}

function topTabAt(text: string, fs: number, w: number, maxW: number): Capsule | null {
  const padX = Math.round(fs * CAPSULE_PAD_X * 1.3);
  const fitted = fitSoftText(text, fs, 600, maxW - padX * 2);
  if (!fitted) return null;
  const height = Math.round(fs * TAB_HEIGHT);
  const width = Math.round(measureSoftText(fitted, fs, 600) + padX * 2);
  return { text: fitted, fs, tab: true, rect: { left: Math.round((w - width) / 2), top: 0, width, height } };
}

export async function capsuleSvg(base: Buffer, capsule: Capsule): Promise<string[]> {
  const { rect, fs, text } = capsule;
  const fill = await capsuleFill(base, rect);
  const { left: x, top: y, width: cw, height: ch } = rect;
  const r = Math.round(ch * TAB_RADIUS);
  const shape = capsule.tab
    ? `<path d="M${x} ${y}H${x + cw}V${y + ch - r}Q${x + cw} ${y + ch} ${x + cw - r} ${y + ch}H${x + r}Q${x} ${y + ch} ${x} ${y + ch - r}Z" fill="${fill}"/>`
    : `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="${(ch / 2).toFixed(2)}" fill="${fill}"/>`;
  const parts = [shape];
  const baseline = y + ch / 2 + softCapHeight(fs, 600) / 2;
  const textX = x + (cw - measureSoftText(text, fs, 600)) / 2;
  const placed = softTextPath(text, textX, baseline, fs, 600);
  if (placed) parts.push(`<path d="${placed.d}" fill="${TEXT_PRIMARY}"/>`);
  return parts;
}

const STAR_SHARE = 0.78;
const STAR_GAP_SHARE = 0.32;
const STAR_INNER_RATIO = 0.48;
const STAR_POINTS = 5;

function starPath(cx: number, cy: number, outer: number): string {
  const inner = outer * STAR_INNER_RATIO;
  const points: string[] = [];
  for (let i = 0; i < STAR_POINTS * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / STAR_POINTS;
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

type RatingCapsule = { rect: Rect; text: string; fs: number; star: boolean; textW: number; padX: number };

export function ratingCapsuleAt(params: {
  valueTen: number;
  fs: number;
  right: number;
  centerY: number;
  star: boolean;
}): RatingCapsule {
  const { fs } = params;
  const text = scoreLabel(params.valueTen);
  const padX = Math.round(fs * CAPSULE_PAD_X);
  const textW = measureSoftText(text, fs, 600);
  const starW = params.star ? Math.round(fs * STAR_SHARE + fs * STAR_GAP_SHARE) : 0;
  const width = Math.round(padX * 2 + starW + textW);
  const height = Math.round(fs * CAPSULE_HEIGHT);
  return {
    rect: { left: params.right - width, top: Math.round(params.centerY - height / 2), width, height },
    text,
    fs,
    star: params.star,
    textW,
    padX,
  };
}

async function ratingCapsuleSvg(base: Buffer, capsule: RatingCapsule, color: string): Promise<string[]> {
  const { rect, fs, text } = capsule;
  const fill = await capsuleFill(base, rect);
  const { left: x, top: y, width: cw, height: ch } = rect;
  const parts = [`<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="${(ch / 2).toFixed(2)}" fill="${fill}"/>`];
  let textX = x + capsule.padX;
  if (capsule.star) {
    const outer = (fs * STAR_SHARE) / 2;
    parts.push(`<path d="${starPath(textX + outer, y + ch / 2, outer)}" fill="${color}"/>`);
    textX += Math.round(fs * STAR_SHARE + fs * STAR_GAP_SHARE);
  }
  const baseline = y + ch / 2 + softCapHeight(fs, 600) / 2;
  const placed = softTextPath(text, textX, baseline, fs, 600);
  if (placed) parts.push(`<path d="${placed.d}" fill="${capsule.star ? TEXT_PRIMARY : color}"/>`);
  return parts;
}

export type TopItem =
  | { kind: "text"; text: string; width: number }
  | { kind: "glyph"; buf: Buffer; width: number; height: number };

export async function buildTopItems(
  markIds: QualityMarkId[],
  ageLabel: string | null,
  fs: number,
): Promise<TopItem[]> {
  const items: TopItem[] = [];
  for (const id of MARK_ORDER) {
    if (!markIds.includes(id)) continue;
    const text = MARK_TEXT[id];
    if (text) {
      items.push({ kind: "text", text, width: measureSoftText(text, fs, 600) });
      continue;
    }
    const glyph = await loadMarkGlyph(id, fs * DOLBY_GLYPH_HEIGHT);
    if (glyph) items.push({ kind: "glyph", buf: glyph.buf, width: glyph.width, height: glyph.height });
  }
  if (ageLabel) items.push({ kind: "text", text: ageLabel, width: measureSoftText(ageLabel, fs, 600) });
  return items;
}

export function itemsCapsuleWidth(items: TopItem[], scale: number, fs: number): number {
  if (items.length === 0) return 0;
  const content = items.reduce((sum, item) => sum + item.width * scale, 0);
  const gaps = fs * scale * TOP_ITEM_GAP * (items.length - 1);
  return Math.round(content + gaps + fs * scale * CAPSULE_PAD_X * 2);
}

export function fitTopRow(params: {
  label: string | null;
  items: TopItem[];
  fs: number;
  w: number;
  padX: number;
}): { label: string | null; items: TopItem[]; fs: number; itemsWidth: number } {
  const available = params.w - params.padX * 2;
  const separation = Math.round(params.w * FOOTER_GAP);
  const labelWidth = (fs: number) =>
    params.label ? measureSoftText(params.label, fs, 600) + fs * CAPSULE_PAD_X * 2 : 0;
  const rowWidth = (items: TopItem[], scale: number) => {
    const fs = params.fs * scale;
    const right = itemsCapsuleWidth(items, scale, params.fs);
    if (!params.label) return right;
    return right > 0 ? labelWidth(fs) + separation + right : labelWidth(fs);
  };

  let items = params.items;
  for (;;) {
    for (let scale = 1; scale >= TOP_ROW_MIN_SCALE - 1e-9; scale -= TOP_ROW_SCALE_STEP) {
      if (rowWidth(items, scale) <= available) {
        return {
          label: params.label,
          items: items.map((item) => scaleTopItem(item, scale)),
          fs: Math.round(params.fs * scale),
          itemsWidth: itemsCapsuleWidth(items, scale, params.fs),
        };
      }
    }
    if (items.length === 0) {
      return { label: params.label, items: [], fs: Math.round(params.fs * TOP_ROW_MIN_SCALE), itemsWidth: 0 };
    }
    items = items.slice(0, -1);
  }
}

function scaleTopItem(item: TopItem, scale: number): TopItem {
  return item.kind === "text"
    ? { ...item, width: item.width * scale }
    : { ...item, width: item.width * scale, height: item.height * scale };
}

export async function marksCapsuleSvg(
  base: Buffer,
  capsule: { rect: Rect; items: TopItem[]; fs: number },
): Promise<{ parts: string[]; glyphs: OverlayOptions[] }> {
  const { rect, items, fs } = capsule;
  const fill = await capsuleFill(base, rect);
  const parts = [
    `<rect x="${rect.left}" y="${rect.top}" width="${rect.width}" height="${rect.height}" rx="${(rect.height / 2).toFixed(2)}" fill="${fill}"/>`,
  ];
  const glyphs: OverlayOptions[] = [];
  const centerY = rect.top + rect.height / 2;
  let x = rect.left + fs * CAPSULE_PAD_X;
  for (const item of items) {
    if (item.kind === "text") {
      const placed = softTextPath(item.text, x, centerY + softCapHeight(fs, 600) / 2, fs, 600);
      if (placed) parts.push(`<path d="${placed.d}" fill="${TEXT_PRIMARY}"/>`);
    } else {
      const width = Math.max(1, Math.round(item.width));
      const height = Math.max(1, Math.round(item.height));
      glyphs.push({
        input: await sharp(item.buf).resize({ width, height, fit: "fill" }).png(INTERMEDIATE_PNG).toBuffer(),
        left: Math.round(x),
        top: Math.round(centerY - height / 2),
      });
    }
    x += item.width + fs * TOP_ITEM_GAP;
  }
  return { parts, glyphs };
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
  prefetchedLogo?: PrefetchedPosterLogo | null;
}): Promise<Buffer | null> {
  ensurePolisSharpConfigured();
  const { overlay } = params;

  const inputMeta = await sharp(params.imageBuffer).metadata();
  const baseBuf =
    inputMeta.width === POSTER_WIDTH && inputMeta.height === POSTER_HEIGHT
      ? params.imageBuffer
      : await sharp(params.imageBuffer)
          .resize(POSTER_WIDTH, POSTER_HEIGHT, { fit: "cover", position: "attention" })
          .toBuffer();
  const w = POSTER_WIDTH;
  const h = POSTER_HEIGHT;

  const padX = Math.round(w * PAD_X);
  const padBottom = Math.round(w * PAD_BOTTOM);
  const padTop = Math.round(w * PAD_TOP);

  const ringScale = textSizeFactor(overlay, "ratingFontSize");

  const valueTen = overlay.rating ? params.ratingValueTen : null;
  const showRing = valueTen != null && Number.isFinite(valueTen);
  const ringD = Math.round(w * RING_DIAMETER * ringScale);
  const ringStroke = Math.max(2, w * RING_STROKE * ringScale);
  const scoreFs = scoreTextPx(w, overlay);
  const genreFs = labelTextPx(w, overlay, "genreFontSize");
  const trendFs = labelTextPx(w, overlay, "trendFontSize");

  const textRating = overlay.look === "classic";
  const ratingH = textRating ? Math.round(scoreFs * CAPSULE_HEIGHT) : ringD;
  const genreRaw = overlay.genre ? normalizeGenreLabel(params.genreNames, overlay.genreMode) : null;
  const footerH = Math.max(showRing ? ratingH : 0, genreRaw ? Math.round(genreFs * CAPSULE_HEIGHT) : 0);
  const hasFooter = footerH > 0;
  const footerCenterY = h - padBottom - footerH / 2;

  const trendText = overlay.trendTags ? (params.trendBadges[0]?.text ?? null) : null;
  const ageLabel = overlay.ageRating ? (params.ageBadge?.text ?? null) : null;

  const drawLogo = overlay.logoOnPoster && params.logoPath != null;
  const layers: OverlayOptions[] = [];
  if (drawLogo) {
    if (params.artTextless) layers.push(await softBlurBand(baseBuf, w, h));
  }
  if (hasFooter || drawLogo) {
    const strength = drawLogo ? 1 : 0.55;
    const scrimH = Math.round(h * SCRIM_BAND);
    layers.push({
      input: gradientSvg(w, scrimH, [[0, 0.66 * strength], [0.45, 0.28 * strength], [1, 0]]),
      top: h - scrimH,
      left: 0,
    });
  }

  const markIds = overlay.qualityTags ? normalizeQualityMarkIds(params.qualityMarkIds) : [];
  const topItems = await buildTopItems(markIds, ageLabel, trendFs);
  const topRow = fitTopRow({ label: trendText, items: topItems, fs: trendFs, w, padX });
  const trendCapsule = !topRow.label
    ? null
    : topRow.items.length === 0
      ? topTabAt(topRow.label, topRow.fs, w, w - padX * 2)
      : capsuleAt(topRow.label, topRow.fs, padX, padTop + Math.round((topRow.fs * CAPSULE_HEIGHT) / 2), w - padX * 2);
  const marksCapsule =
    topRow.items.length > 0
      ? {
          rect: {
            left: w - padX - topRow.itemsWidth,
            top: padTop,
            width: topRow.itemsWidth,
            height: Math.round(topRow.fs * CAPSULE_HEIGHT),
          },
          items: topRow.items,
          fs: topRow.fs,
        }
      : null;
  const topBandBottom = Math.max(
    trendCapsule ? trendCapsule.rect.top + trendCapsule.rect.height : 0,
    marksCapsule ? marksCapsule.rect.top + marksCapsule.rect.height : 0,
  );

  if (drawLogo && params.logoPath) {
    const { maxW: maxLogoW, maxH: maxLogoH } = logoMaxBox(w, h, overlay.logoSize);
    const bottomLimit = hasFooter
      ? Math.round(footerCenterY - footerH / 2 - w * LOGO_GAP_SHARE)
      : h - padBottom;
    const logoPadTop = topBandBottom > 0 ? topBandBottom + Math.round(w * LOGO_GAP_SHARE) : padTop;

    const placeLogo = async (path: string) => {
      const raster = await preparePosterLogoRaster(path, maxLogoW, params.prefetchedLogo);
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
          : await sharp(raster.buffer).resize({ width: logoW, height: logoH, fit: "fill" }).png(INTERMEDIATE_PNG).toBuffer();
      const sample = await sampleLogo(logo, baseBuf, rect);
      const scrimAlpha = logoScrimAlpha(sample.meanLogoLum, sample.backdropHigh);
      return { logo, rect, scrimAlpha, share: logoLegibleShare(sample, scrimAlpha) };
    };

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
  const ratingColorValue = valueTen != null ? ringColor(overlay, valueTen, params.ratingColorSource) : TEXT_PRIMARY;
  if (showRing && valueTen != null && textRating) {
    const capsule = ratingCapsuleAt({
      valueTen,
      fs: scoreFs,
      right: w - padX,
      centerY: footerCenterY,
      star: overlay.ratingStyle === "min",
    });
    svgParts.push(...(await ratingCapsuleSvg(baseBuf, capsule, ratingColorValue)));
    genreRight = capsule.rect.left - Math.round(w * FOOTER_GAP);
  } else if (showRing && valueTen != null) {
    const cx = w - padX - ringD / 2;
    svgParts.push(
      ...ratingRingSvg({
        cx,
        cy: footerCenterY,
        diameter: ringD,
        stroke: ringStroke,
        valueTen,
        color: ratingColorValue,
        scoreFs,
      }),
    );
    genreRight = cx - ringD / 2 - Math.round(w * FOOTER_GAP);
  }

  const glyphLayers: OverlayOptions[] = [];
  if (marksCapsule) {
    const drawn = await marksCapsuleSvg(baseBuf, marksCapsule);
    svgParts.push(...drawn.parts);
    glyphLayers.push(...drawn.glyphs);
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

  layers.push(...glyphLayers);
  return encodePosterImage(layers.length > 0 ? sharp(baseBuf).composite(layers) : baseBuf);
}
