import { describe, expect, test } from "bun:test";

import {
  buildTrendPillGlyphLayout,
  getOverlayFont,
} from "@/lib/overlay-font-metrics";
import { measureTrendPillBadge } from "@/lib/poster-trend-pill";

const hasFonts = getOverlayFont(700) != null;

describe("overlay font metrics", () => {
  test("loads bold overlay font file", () => {
    if (!hasFonts) return;
    expect(getOverlayFont(700)?.unitsPerEm).toBeGreaterThan(0);
  });

  test("certified hot glyph bbox fits inside pill", () => {
    if (!hasFonts) return;
    const metrics = measureTrendPillBadge({ text: "Certified Hot", priority: 72 }, 500, 45);
    expect(metrics).not.toBeNull();
    const layout = buildTrendPillGlyphLayout(metrics!.text, metrics!.fontSize, metrics!.padX, metrics!.padY)!;
    expect(layout.boxW).toBe(metrics!.boxW);
    expect(layout.textOffsetX).toBeGreaterThanOrEqual(metrics!.padX - 1);
    expect(layout.textOffsetY).toBeGreaterThanOrEqual(metrics!.padY - 1);
    expect(layout.textPath.length).toBeGreaterThan(10);
  });

  test("glyph layout uses symmetric vertical padding", () => {
    if (!hasFonts) return;
    const fontSize = 32;
    const padX = 9;
    const padY = 4;
    const layout = buildTrendPillGlyphLayout("#3 Trending", fontSize, padX, padY)!;
    const innerH = layout.boxH - padY * 2;
    expect(innerH).toBeGreaterThan(fontSize * 0.7);
    expect(innerH).toBeLessThan(fontSize * 1.15);
  });
});
