import { formatGenreDisplayName } from "@/lib/genre-display";
import {
  buildTrendPillGlyphLayout,
  measureOverlayText,
  type TrendPillGlyphLayout,
} from "@/lib/overlay-font-metrics";
import { trendPillPadding } from "@/lib/poster-trend-pill";

const FOOTER_PILL_GAP_PX = 12;
const BOLD_CHAR_WIDTH = 0.58;
const SPACE_WIDTH = 0.28;
const AMP_WIDTH = 0.5;
export const FOOTER_PILL_LETTER_SPACING_EM = 0.02;

export type FooterPillMetrics = TrendPillGlyphLayout;

export type PillTextWidthOptions = {
  letterSpacingEm?: number;
};

export function estimatePillTextWidth(
  text: string,
  fontSize: number,
  options?: PillTextWidthOptions,
): number {
  let width = 0;
  for (const ch of text) {
    if (ch === " ") {
      width += SPACE_WIDTH * fontSize;
    } else if (ch === "&") {
      width += AMP_WIDTH * fontSize;
    } else if (ch === "★") {
      width += 0.82 * fontSize;
    } else {
      width += BOLD_CHAR_WIDTH * fontSize;
    }
  }
  const letterSpacingEm = options?.letterSpacingEm ?? 0;
  if (letterSpacingEm > 0 && text.length > 1) {
    width += letterSpacingEm * fontSize * (text.length - 1);
  }
  return Math.ceil(width);
}

function footerPillTextWidth(text: string, fontSize: number): number {
  return estimatePillTextWidth(text, fontSize, {
    letterSpacingEm: FOOTER_PILL_LETTER_SPACING_EM,
  });
}

export function truncateTextToPillWidth(text: string, maxTextWidth: number, fontSize: number): string {
  const trimmed = text.trim();
  if (!trimmed || maxTextWidth <= 0) return "";
  if (footerPillTextWidth(trimmed, fontSize) <= maxTextWidth) return trimmed;

  const ellipsis = "…";
  const ellipsisW = footerPillTextWidth(ellipsis, fontSize);
  const budget = Math.max(fontSize * 0.5, maxTextWidth - ellipsisW);

  let low = 0;
  let high = trimmed.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = trimmed.slice(0, mid);
    if (footerPillTextWidth(candidate, fontSize) <= budget) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  if (low <= 0) return ellipsis;
  return `${trimmed.slice(0, low)}${ellipsis}`;
}

function truncateTextToFooterBoxWidth(
  text: string,
  maxBoxWidth: number,
  fontSize: number,
): string {
  const trimmed = text.trim();
  if (!trimmed || maxBoxWidth <= 0) return "";

  const { padX, padY } = trendPillPadding(fontSize);
  const full = buildTrendPillGlyphLayout(trimmed, fontSize, padX, padY);
  if (full && full.boxW <= maxBoxWidth) return trimmed;

  const ellipsis = "…";
  const ellipsisLayout = buildTrendPillGlyphLayout(ellipsis, fontSize, padX, padY);
  const ellipsisW = ellipsisLayout?.boxW ?? footerPillTextWidth(ellipsis, fontSize) + padX * 2;

  let low = 0;
  let high = trimmed.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = trimmed.slice(0, mid);
    const layout = buildTrendPillGlyphLayout(candidate, fontSize, padX, padY);
    const boxW =
      layout?.boxW ??
      footerPillTextWidth(candidate, fontSize) + trendPillPadding(fontSize).padX * 2;
    if (boxW + ellipsisW <= maxBoxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  if (low <= 0) return ellipsis;
  return `${trimmed.slice(0, low)}${ellipsis}`;
}

function measureFooterPillHeuristic(text: string, fontSize: number): FooterPillMetrics {
  const { padX, padY } = trendPillPadding(fontSize);
  const measured = measureOverlayText(text, fontSize, 700);
  const textW = measured?.width ?? footerPillTextWidth(text, fontSize);
  const textH = measured?.lineHeight ?? fontSize;
  return {
    text,
    fontSize,
    padX,
    padY,
    boxW: Math.round(textW + padX * 2),
    boxH: Math.round(textH + padY * 2),
    textPath: "",
    textOffsetX: padX,
    textOffsetY: padY,
  };
}

export function footerPillNominalBoxHeight(fontSize: number): number {
  return measureFooterPill("Mg", fontSize).boxH;
}

export function measureFooterPill(
  text: string,
  fontSize: number,
  maxBoxWidth?: number,
): FooterPillMetrics {
  const { padX, padY } = trendPillPadding(fontSize);
  const fitted =
    maxBoxWidth != null
      ? truncateTextToFooterBoxWidth(text, maxBoxWidth, fontSize)
      : text.trim();
  const layout = buildTrendPillGlyphLayout(fitted, fontSize, padX, padY);
  if (layout) return layout;
  return measureFooterPillHeuristic(fitted, fontSize);
}

export function footerPillUsesGlyphPath(metrics: FooterPillMetrics): boolean {
  return metrics.textPath.length > 0;
}

export function maxGenrePillBoxWidth(params: {
  canvasWidth: number;
  edgePadX: number;
  ratingPillBoxWidth: number | null;
}): number {
  const usable = params.canvasWidth - params.edgePadX * 2;
  if (params.ratingPillBoxWidth == null) {
    return Math.round(usable * 0.72);
  }
  const reserved = params.ratingPillBoxWidth + FOOTER_PILL_GAP_PX;
  return Math.max(Math.round(params.canvasWidth * 0.28), usable - reserved);
}

export type FooterPillBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function footerPillBox(
  metrics: FooterPillMetrics,
  canvasH: number,
  padBottom: number,
  boxLeft: number,
): FooterPillBox {
  return {
    left: boxLeft,
    top: canvasH - padBottom - metrics.boxH,
    width: metrics.boxW,
    height: metrics.boxH,
  };
}

export function normalizeGenreLabel(genreNames: string[], mode: "first" | "top3"): string | null {
  const list = genreNames.map((g) => formatGenreDisplayName(g)).filter(Boolean);
  if (list.length === 0) return null;
  if (mode === "top3") {
    return list
      .slice(0, 3)
      .map((g) => g.replace(/\s*&\s*/g, " · "))
      .join(" · ");
  }
  return list[0].replace(/\s*&\s*/g, " & ");
}
