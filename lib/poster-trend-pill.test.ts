import { describe, expect, test } from "bun:test";

import { getOverlayFont } from "@/lib/overlay-font-metrics";
import {
  measureTrendPillBadge,
  trendPillBoxTop,
  trendPillFlushTopPath,
  trendPillPadding,
} from "@/lib/poster-trend-pill";

const hasFonts = getOverlayFont(700) != null;

describe("poster trend pill", () => {
  test("returns null without overlay fonts", () => {
    if (hasFonts) return;
    expect(measureTrendPillBadge({ text: "Certified Hot", priority: 72 }, 500, 45)).toBeNull();
  });

  test("centered trend sits flush on poster top", () => {
    expect(trendPillBoxTop(true, 11)).toBe(0);
    expect(trendPillBoxTop(false, 11)).toBe(11);
  });

  test("flush top path uses flat top and rounded bottom", () => {
    const path = trendPillFlushTopPath(10, 0, 120, 40);
    expect(path.startsWith("M 10 0 H 130")).toBe(true);
    expect(path.includes("A ")).toBe(true);
  });

  test("flush top padding is taller than default trend padding", () => {
    const flush = trendPillPadding(45, true);
    const normal = trendPillPadding(45, false);
    expect(flush.padY).toBeGreaterThan(normal.padY);
  });
});
