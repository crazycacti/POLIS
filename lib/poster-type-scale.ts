import { POSTER_OVERLAY_DEFAULTS, type LogoSize, type PosterOverlayQuery } from "@/lib/poster-query";

// One type scale for every look. Sizes are shares of poster width so they hold from phone rails to TVs,
// and each font setting scales its text relative to that setting's default.
export const LABEL_TEXT_SHARE = 0.058;
export const SCORE_TEXT_SHARE = 0.064;
export const LOGO_WIDTH_SHARE: Record<LogoSize, number> = { small: 0.5, medium: 0.66, large: 0.8 };
export const LOGO_MAX_HEIGHT_SHARE = 0.24;
export const LOGO_GAP_SHARE = 0.035;
const MIN_SIZE_FACTOR = 0.6;
const MAX_SIZE_FACTOR = 1.6;

type FontSetting = "trendFontSize" | "genreFontSize" | "ratingFontSize";

export function textSizeFactor(overlay: Pick<PosterOverlayQuery, FontSetting>, setting: FontSetting): number {
  const ratio = overlay[setting] / POSTER_OVERLAY_DEFAULTS[setting];
  return Math.min(MAX_SIZE_FACTOR, Math.max(MIN_SIZE_FACTOR, ratio));
}

export function labelTextPx(
  canvasW: number,
  overlay: Pick<PosterOverlayQuery, FontSetting>,
  setting: "trendFontSize" | "genreFontSize",
): number {
  return Math.round(canvasW * LABEL_TEXT_SHARE * textSizeFactor(overlay, setting));
}

export function scoreTextPx(canvasW: number, overlay: Pick<PosterOverlayQuery, FontSetting>): number {
  return Math.round(canvasW * SCORE_TEXT_SHARE * textSizeFactor(overlay, "ratingFontSize"));
}

export function logoMaxBox(
  canvasW: number,
  canvasH: number,
  logoSize: LogoSize,
): { maxW: number; maxH: number } {
  return {
    maxW: Math.round(canvasW * LOGO_WIDTH_SHARE[logoSize]),
    maxH: Math.round(canvasH * LOGO_MAX_HEIGHT_SHARE),
  };
}
