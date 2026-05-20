import type { PosterPillBadge } from "@/lib/poster-badges";
import { buildTrendPillGlyphLayout } from "@/lib/overlay-font-metrics";

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

const TREND_FONT_REF = 57;

export function scaledTrendFontSize(canvasW: number, configuredTrendFontSize: number): number {
  const nominal = Math.min(Math.max(Math.round(canvasW * 0.08), 30), 44);
  return Math.min(
    Math.max(Math.round(nominal * (configuredTrendFontSize / TREND_FONT_REF)), 18),
    72,
  );
}

export function trendPillPadding(fontSize: number): { padX: number; padY: number } {
  return {
    padX: Math.round(fontSize * 0.28),
    padY: Math.round(fontSize * 0.14),
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
): TrendPillMetrics | null {
  const fontSize = scaledTrendFontSize(canvasW, configuredTrendFontSize);
  const text = badge.text.length <= 24 ? badge.text : `${badge.text.slice(0, 23)}…`;
  const { padX, padY } = trendPillPadding(fontSize);
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
