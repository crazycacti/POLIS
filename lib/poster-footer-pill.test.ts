import { describe, expect, test } from "bun:test";

import { getOverlayFont } from "@/lib/overlay-font-metrics";
import {
  FOOTER_PILL_LETTER_SPACING_EM,
  estimatePillTextWidth,
  footerPillUsesGlyphPath,
  maxGenrePillBoxWidth,
  measureFooterPill,
  normalizeGenreLabel,
  truncateTextToPillWidth,
} from "@/lib/poster-footer-pill";
import { trendPillPadding } from "@/lib/poster-trend-pill";

const hasFonts = getOverlayFont(700) != null;

describe("poster footer pill layout", () => {
  test("truncates long genre to fit max box width", () => {
    const fs = 32;
    const maxBox = 200;
    const fitted = measureFooterPill("Action & Adventure", fs, maxBox);
    expect(fitted.boxW).toBeLessThanOrEqual(maxBox);
    expect(fitted.text.length).toBeLessThan("Action & Adventure".length);
    expect(fitted.text.endsWith("…")).toBe(true);
  });

  test("reserves space for rating pill", () => {
    const canvasW = 500;
    const edgePadX = 14;
    const ratingBoxW = 120;
    const maxGenre = maxGenrePillBoxWidth({
      canvasWidth: canvasW,
      edgePadX,
      ratingPillBoxWidth: ratingBoxW,
    });
    const genre = measureFooterPill("Action & Adventure", 32, maxGenre);
    const genreRight = edgePadX + genre.boxW;
    const ratingLeft = canvasW - edgePadX - ratingBoxW;
    expect(genreRight).toBeLessThanOrEqual(ratingLeft);
  });

  test("normalizeGenreLabel joins top3 with middle dots", () => {
    expect(normalizeGenreLabel(["Action", "Adventure", "Science Fiction"], "top3")).toBe(
      "Action · Adventure · Sci-Fi",
    );
  });

  test("truncateTextToPillWidth never exceeds budget", () => {
    const fs = 30;
    const max = 140;
    const out = truncateTextToPillWidth("Science Fiction & Adventure", max, fs);
    expect(estimatePillTextWidth(out, fs)).toBeLessThanOrEqual(max);
  });

  test("trend labels need per-char width not length times half em", () => {
    const fs = 36;
    const text = "Emmy Winner";
    const legacy = Math.ceil(text.length * fs * 0.5);
    expect(estimatePillTextWidth(text, fs)).toBeGreaterThan(legacy);
  });

  test("footer pill uses glyph layout when fonts are available", () => {
    if (!hasFonts) return;
    const fs = 36;
    const pill = measureFooterPill("★ 6.3", fs);
    expect(footerPillUsesGlyphPath(pill)).toBe(true);
    expect(pill.textPath.length).toBeGreaterThan(10);
    const { padX, padY } = trendPillPadding(fs);
    expect(pill.padX).toBe(padX);
    expect(pill.padY).toBe(padY);
    expect(pill.boxH).toBeLessThan(fs + padY * 2 + 6);
  });

  test("footer pill is tighter than legacy estimate padding", () => {
    if (!hasFonts) return;
    const fs = 38;
    const pill = measureFooterPill("Crime", fs);
    const legacyH = fs + Math.round(fs * 0.32) * 2;
    expect(pill.boxH).toBeLessThan(legacyH);
  });

  test("letter-spacing widens footer text estimate", () => {
    const fs = 32;
    const text = "★ 6.3";
    const plain = estimatePillTextWidth(text, fs);
    const tracked = estimatePillTextWidth(text, fs, {
      letterSpacingEm: FOOTER_PILL_LETTER_SPACING_EM,
    });
    expect(tracked).toBeGreaterThan(plain);
  });
});
