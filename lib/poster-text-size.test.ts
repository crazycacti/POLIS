import { describe, expect, it } from "bun:test";

import { parsePosterOverlayQuery, POSTER_OVERLAY_DEFAULTS, serializePosterQuery } from "@/lib/poster-query";
import { textSizeFields, textSizePresetOf } from "@/lib/poster-text-size";

describe("text size presets", () => {
  it("treats the default sizes as Medium", () => {
    expect(textSizePresetOf(POSTER_OVERLAY_DEFAULTS)).toBe("medium");
    expect(textSizeFields("medium")).toEqual({
      genreFontSize: POSTER_OVERLAY_DEFAULTS.genreFontSize,
      ratingFontSize: POSTER_OVERLAY_DEFAULTS.ratingFontSize,
      trendFontSize: POSTER_OVERLAY_DEFAULTS.trendFontSize,
      qualityMarkSize: POSTER_OVERLAY_DEFAULTS.qualityMarkSize,
    });
  });

  it("makes TV the largest size every slider allows", () => {
    expect(Object.values(textSizeFields("tv"))).toEqual([72, 72, 72, 72]);
  });

  it("keeps a preset through the poster URL", () => {
    const query = serializePosterQuery({ ...POSTER_OVERLAY_DEFAULTS, ...textSizeFields("large") });
    expect(textSizePresetOf(parsePosterOverlayQuery(new URLSearchParams(query)))).toBe("large");
  });

  it("reports no preset after one size is moved by hand", () => {
    expect(textSizePresetOf({ ...textSizeFields("small"), genreFontSize: 60 })).toBeNull();
  });
});
