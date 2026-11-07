import sharp, { type OverlayOptions } from "sharp";

import { fitLandscapeCanvas, LANDSCAPE_HEIGHT, LANDSCAPE_WIDTH } from "@/lib/landscape-artwork";
import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import type { PosterPillBadge } from "@/lib/poster-badges";
import { encodePosterImageWithinBudget, INTERMEDIATE_PNG } from "@/lib/poster-encode";
import { preparePosterLogoRaster, type PrefetchedPosterLogo } from "@/lib/poster-logo-on-poster";
import { normalizeQualityMarkIds, type QualityMarkId } from "@/lib/poster-quality-marks";
import type { LogoSize, PosterOverlayQuery } from "@/lib/poster-query";
import { labelTextPx, scoreTextPx, textSizeFactor } from "@/lib/poster-type-scale";
import type { RatingSource } from "@/lib/ratings";
import {
  buildTopItems,
  CAPSULE_HEIGHT,
  capsuleAt,
  capsuleSvg,
  itemsCapsuleWidth,
  LOGO_MIN_LEGIBLE_SHARE,
  LOGO_SHADOW_OFFSET,
  logoLegibleShare,
  logoScrim,
  logoScrimAlpha,
  logoShadow,
  marksCapsuleSvg,
  RING_DIAMETER,
  RING_STROKE,
  ratingRingSvg,
  ringColor,
  sampleLogo,
  type Rect,
} from "@/lib/render-poster-soft";

const SIZE_REF_PER_HEIGHT = 500 / LANDSCAPE_HEIGHT;
const PAD_X = 0.065;
const PAD_BOTTOM = 0.065;
const ROW_GAP = 0.03;
const LOGO_ROW_GAP = 0.04;
const INFO_ROW_MAX_WIDTH = 0.86;
const LOGO_WIDTH_SHARE: Record<LogoSize, number> = { small: 0.3, medium: 0.38, large: 0.46 };
const LOGO_MAX_HEIGHT_SHARE = 0.34;
const SIDE_SCRIM_WIDTH = 0.72;
const BOTTOM_SCRIM_HEIGHT = 0.6;
const SIDE_SCRIM_STOPS: [number, number][] = [[0, 0.72], [0.45, 0.38], [1, 0]];
const BOTTOM_SCRIM_STOPS: [number, number][] = [[0, 0.62], [0.5, 0.22], [1, 0]];
const ROW_ONLY_SCRIM_STRENGTH = 0.7;
export const LANDSCAPE_BYTE_BUDGET = 80 * 1024;

function linearScrim(w: number, h: number, horizontal: boolean, stops: [number, number][], strength: number): Buffer {
  const stopTags = stops
    .map(([offset, alpha]) => `<stop offset="${offset}" stop-color="#000" stop-opacity="${(alpha * strength).toFixed(3)}"/>`)
    .join("");
  const axis = horizontal ? `x1="0" y1="0" x2="1" y2="0"` : `x1="0" y1="1" x2="0" y2="0"`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" ${axis}>${stopTags}</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`,
  );
}

type PlacedLogo = { logo: Buffer; rect: Rect; scrimAlpha: number; share: number };

async function placeLogo(params: {
  path: string;
  baseBuf: Buffer;
  maxW: number;
  maxH: number;
  left: number;
  bottom: number;
  prefetched: PrefetchedPosterLogo | null;
}): Promise<PlacedLogo | null> {
  const raster = await preparePosterLogoRaster(params.path, params.maxW, params.prefetched);
  if (!raster) return null;
  const scale = Math.min(1, params.maxW / raster.width, params.maxH / raster.height);
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  const rect = { left: params.left, top: Math.max(0, params.bottom - height), width, height };
  const logo =
    width === raster.width && height === raster.height
      ? raster.buffer
      : await sharp(raster.buffer).resize({ width, height, fit: "fill" }).png(INTERMEDIATE_PNG).toBuffer();
  const sample = await sampleLogo(logo, params.baseBuf, rect);
  const scrimAlpha = logoScrimAlpha(sample.meanLogoLum, sample.backdropHigh);
  return { logo, rect, scrimAlpha, share: logoLegibleShare(sample, scrimAlpha) };
}

export async function renderLandscapeSoft(params: {
  imageBuffer: Buffer;
  artTextless: boolean;
  overlay: PosterOverlayQuery;
  ratingValueTen: number | null;
  ratingColorSource: RatingSource | null;
  trendBadges: PosterPillBadge[];
  qualityMarkIds: QualityMarkId[];
  ageBadge: PosterPillBadge | null;
  logoPath: string | null;
  logoAlternates?: string[];
  prefetchedLogo?: PrefetchedPosterLogo | null;
}): Promise<Buffer> {
  ensurePolisSharpConfigured();
  const { overlay } = params;
  const w = LANDSCAPE_WIDTH;
  const h = LANDSCAPE_HEIGHT;
  const baseBuf = await fitLandscapeCanvas(params.imageBuffer);

  const sizeRef = Math.round(h * SIZE_REF_PER_HEIGHT);
  const padX = Math.round(h * PAD_X);
  const padBottom = Math.round(h * PAD_BOTTOM);
  const gap = Math.round(h * ROW_GAP);
  const rowMaxRight = Math.round(w * INFO_ROW_MAX_WIDTH);

  const valueTen = overlay.rating ? params.ratingValueTen : null;
  const showRing = valueTen != null && Number.isFinite(valueTen);
  const ringScale = textSizeFactor(overlay, "ratingFontSize");
  const ringD = Math.round(sizeRef * RING_DIAMETER * ringScale);
  const ringStroke = Math.max(2, sizeRef * RING_STROKE * ringScale);
  const scoreFs = scoreTextPx(sizeRef, overlay);
  const trendFs = labelTextPx(sizeRef, overlay, "trendFontSize");
  const pillH = Math.round(trendFs * CAPSULE_HEIGHT);

  const trendText = overlay.trendTags ? (params.trendBadges[0]?.text ?? null) : null;
  const ageLabel = overlay.ageRating ? (params.ageBadge?.text ?? null) : null;
  const markIds = overlay.qualityTags ? normalizeQualityMarkIds(params.qualityMarkIds) : [];
  const markItems = await buildTopItems(markIds, ageLabel, trendFs);

  const rowH = Math.max(showRing ? ringD : 0, trendText || markItems.length > 0 ? pillH : 0);
  const hasRow = rowH > 0;
  const rowCenterY = h - padBottom - rowH / 2;

  const svgParts: string[] = [];
  const glyphLayers: OverlayOptions[] = [];
  let cursor = padX;

  if (showRing && valueTen != null) {
    svgParts.push(
      ...ratingRingSvg({
        cx: cursor + ringD / 2,
        cy: rowCenterY,
        diameter: ringD,
        stroke: ringStroke,
        valueTen,
        color: ringColor(overlay, valueTen, params.ratingColorSource),
        scoreFs,
      }),
    );
    cursor += ringD + gap;
  }

  const trendCapsule = trendText ? capsuleAt(trendText, trendFs, cursor, rowCenterY, rowMaxRight - cursor) : null;
  if (trendCapsule) {
    svgParts.push(...(await capsuleSvg(baseBuf, trendCapsule)));
    cursor = trendCapsule.rect.left + trendCapsule.rect.width + gap;
  }

  let items = markItems;
  while (items.length > 0 && cursor + itemsCapsuleWidth(items, 1, trendFs) > rowMaxRight) {
    items = items.slice(0, -1);
  }
  if (items.length > 0) {
    const drawn = await marksCapsuleSvg(baseBuf, {
      rect: {
        left: cursor,
        top: Math.round(rowCenterY - pillH / 2),
        width: itemsCapsuleWidth(items, 1, trendFs),
        height: pillH,
      },
      items,
      fs: trendFs,
    });
    svgParts.push(...drawn.parts);
    glyphLayers.push(...drawn.glyphs);
  }

  const logoLayers: OverlayOptions[] = [];
  const drawLogo = overlay.logoOnPoster && params.artTextless && params.logoPath != null;
  if (drawLogo && params.logoPath) {
    const bottom = hasRow ? Math.round(h - padBottom - rowH - h * LOGO_ROW_GAP) : h - padBottom;
    let chosen: PlacedLogo | null = null;
    for (const path of [params.logoPath, ...(params.logoAlternates ?? [])]) {
      const candidate = await placeLogo({
        path,
        baseBuf,
        maxW: Math.round(w * LOGO_WIDTH_SHARE[overlay.logoSize]),
        maxH: Math.round(h * LOGO_MAX_HEIGHT_SHARE),
        left: padX,
        bottom,
        prefetched: params.prefetchedLogo ?? null,
      });
      if (!candidate) continue;
      if (!chosen || candidate.share > chosen.share) chosen = candidate;
      if (candidate.share >= LOGO_MIN_LEGIBLE_SHARE) break;
    }
    if (chosen) {
      const { logo, rect, scrimAlpha } = chosen;
      const shadow = await logoShadow(logo, sizeRef);
      if (scrimAlpha > 0) logoLayers.push(logoScrim(rect, w, h, scrimAlpha, sizeRef));
      logoLayers.push(
        {
          input: shadow.input,
          top: rect.top - shadow.pad + Math.round(sizeRef * LOGO_SHADOW_OFFSET),
          left: rect.left - shadow.pad,
        },
        { input: logo, top: rect.top, left: rect.left },
      );
    }
  }

  const layers: OverlayOptions[] = [];
  if (logoLayers.length > 0 || hasRow) {
    const strength = logoLayers.length > 0 ? 1 : ROW_ONLY_SCRIM_STRENGTH;
    const sideW = Math.round(w * SIDE_SCRIM_WIDTH);
    const bottomH = Math.round(h * BOTTOM_SCRIM_HEIGHT);
    layers.push(
      { input: linearScrim(sideW, h, true, SIDE_SCRIM_STOPS, strength), top: 0, left: 0 },
      { input: linearScrim(w, bottomH, false, BOTTOM_SCRIM_STOPS, strength), top: h - bottomH, left: 0 },
    );
  }
  layers.push(...logoLayers);
  if (svgParts.length > 0) {
    layers.push({
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svgParts.join("")}</svg>`),
      top: 0,
      left: 0,
    });
  }
  layers.push(...glyphLayers);

  return encodePosterImageWithinBudget(
    layers.length > 0 ? sharp(baseBuf).composite(layers) : baseBuf,
    LANDSCAPE_BYTE_BUDGET,
  );
}
