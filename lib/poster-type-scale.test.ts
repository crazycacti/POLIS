import { describe, expect, test } from "bun:test";

import { POSTER_OVERLAY_DEFAULTS } from "@/lib/poster-query";
import { labelTextPx, scoreTextPx } from "@/lib/poster-type-scale";

describe("poster type scale", () => {
  test("defaults give every label one size and the score one size", () => {
    const trend = labelTextPx(500, POSTER_OVERLAY_DEFAULTS, "trendFontSize");
    const genre = labelTextPx(500, POSTER_OVERLAY_DEFAULTS, "genreFontSize");
    expect(trend).toBe(genre);
    expect(trend).toBe(29);
    expect(scoreTextPx(500, POSTER_OVERLAY_DEFAULTS)).toBe(32);
  });

  test("font settings scale relative to their default, within limits", () => {
    const bigger = { ...POSTER_OVERLAY_DEFAULTS, trendFontSize: POSTER_OVERLAY_DEFAULTS.trendFontSize * 1.2 };
    expect(labelTextPx(500, bigger, "trendFontSize")).toBe(Math.round(500 * 0.058 * 1.2));
    const huge = { ...POSTER_OVERLAY_DEFAULTS, trendFontSize: 999 };
    expect(labelTextPx(500, huge, "trendFontSize")).toBe(Math.round(500 * 0.058 * 1.6));
  });

  test("sizes follow the poster width", () => {
    expect(labelTextPx(1000, POSTER_OVERLAY_DEFAULTS, "genreFontSize")).toBe(58);
  });
});
