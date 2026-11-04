import type { PosterPillBadge } from "@/lib/poster-badges";
import { buildTrendPillGlyphLayout } from "@/lib/overlay-font-metrics";
import { POSTER_OVERLAY_DEFAULTS } from "@/lib/poster-query";
import { labelTextPx } from "@/lib/poster-type-scale";

export type TrendPillMetrics = {
  text: string;
  fontSize: number;
  padX: number;
  padY: number;
  boxW: number;
  boxH: number;
  textPath: string;
  textOffsetX: number;
  textOffsetY: number;
};

export function scaledTrendFontSize(canvasW: number, configuredTrendFontSize: number): number {
  return labelTextPx(canvasW, { ...POSTER_OVERLAY_DEFAULTS, trendFontSize: configuredTrendFontSize }, "trendFontSize");
}

export function trendPillPadding(
  fontSize: number,
  flushTop = false,
): { padX: number; padY: number } {
  return {
    padX: Math.round(fontSize * 0.28),
    padY: Math.round(fontSize * (flushTop ? 0.36 : 0.14)),
  };
}

export function trendPillCornerRadius(boxW: number, boxH: number): number {
  return Math.min(boxW, boxH) / 2;
}

export function trendPillBottomCornerRadius(boxW: number, boxH: number): number {
  return Math.min(Math.round(boxH * 0.5), Math.round(boxW * 0.5));
}

export function trendPillFlushTopPath(
  boxLeft: number,
  boxTop: number,
  boxW: number,
  boxH: number,
): string {
  const rx = trendPillBottomCornerRadius(boxW, boxH);
  const x = boxLeft;
  const y = boxTop;
  const right = x + boxW;
  const bottom = y + boxH;
  return `M ${x} ${y} H ${right} V ${bottom - rx} A ${rx} ${rx} 0 0 1 ${right - rx} ${bottom} H ${x + rx} A ${rx} ${rx} 0 0 1 ${x} ${bottom - rx} Z`;
}

export function measureTrendPillBadge(
  badge: PosterPillBadge,
  canvasW: number,
  configuredTrendFontSize: number,
  flushTop = false,
): TrendPillMetrics | null {
  const fontSize = scaledTrendFontSize(canvasW, configuredTrendFontSize);
  const text = badge.text.length <= 24 ? badge.text : `${badge.text.slice(0, 23)}…`;
  const { padX, padY } = trendPillPadding(fontSize, flushTop);
  return buildTrendPillGlyphLayout(text, fontSize, padX, padY);
}

export function trendPillBoxLeft(
  canvasW: number,
  boxW: number,
  centered: boolean,
  edgePadX: number,
): number {
  return centered ? Math.round((canvasW - boxW) / 2) : edgePadX;
}

export function trendPillBoxTop(centered: boolean, edgePadTop: number): number {
  return centered ? 0 : edgePadTop;
}
