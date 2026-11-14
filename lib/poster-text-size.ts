import { FONT_SIZE_MAX, FONT_SIZE_MIN, POSTER_OVERLAY_DEFAULTS, type PosterOverlayQuery } from "@/lib/poster-query";

export type TextSizePreset = "small" | "medium" | "large" | "tv";

export const TEXT_SIZE_PRESETS: readonly { value: TextSizePreset; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "tv", label: "TV" },
];

const TEXT_SIZE_FACTOR: Record<TextSizePreset, number> = { small: 0.85, medium: 1, large: 1.2, tv: 1.6 };

export const TEXT_SIZE_MIN = FONT_SIZE_MIN;
export const TEXT_SIZE_MAX = FONT_SIZE_MAX;

const TEXT_SIZE_KEYS = ["genreFontSize", "ratingFontSize", "trendFontSize", "qualityMarkSize"] as const;

type TextSizeFields = Pick<PosterOverlayQuery, (typeof TEXT_SIZE_KEYS)[number]>;

function presetSize(key: (typeof TEXT_SIZE_KEYS)[number], preset: TextSizePreset): number {
  const size = Math.round(POSTER_OVERLAY_DEFAULTS[key] * TEXT_SIZE_FACTOR[preset]);
  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, size));
}

export function textSizeFields(preset: TextSizePreset): TextSizeFields {
  return {
    genreFontSize: presetSize("genreFontSize", preset),
    ratingFontSize: presetSize("ratingFontSize", preset),
    trendFontSize: presetSize("trendFontSize", preset),
    qualityMarkSize: presetSize("qualityMarkSize", preset),
  };
}

export function textSizePresetOf(overlay: TextSizeFields): TextSizePreset | null {
  for (const { value } of TEXT_SIZE_PRESETS) {
    const fields = textSizeFields(value);
    if (TEXT_SIZE_KEYS.every((key) => overlay[key] === fields[key])) return value;
  }
  return null;
}
