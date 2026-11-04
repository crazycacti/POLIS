import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { parsePosterOverlayQuery, serializePosterQuery } from "@/lib/poster-query";
import { softFontAvailable } from "@/lib/poster-soft-font";
import { logoLegibleShare, logoScrimAlpha, renderSoftPoster } from "@/lib/render-poster-soft";

describe("poster look options", () => {
  test("soft and medium logo are the defaults and survive a round trip", () => {
    const parsed = parsePosterOverlayQuery(new URLSearchParams());
    expect(parsed.look).toBe("soft");
    expect(parsed.logoSize).toBe("medium");
    const again = parsePosterOverlayQuery(
      new URLSearchParams(serializePosterQuery({ ...parsed, look: "classic", logoSize: "large" })),
    );
    expect(again.look).toBe("classic");
    expect(again.logoSize).toBe("large");
  });

  test("unknown values fall back to the defaults", () => {
    const parsed = parsePosterOverlayQuery(new URLSearchParams("look=neon&logo_size=huge"));
    expect(parsed.look).toBe("soft");
    expect(parsed.logoSize).toBe("medium");
  });
});

describe("renderSoftPoster", () => {
  test("renders a 500x750 poster with or without a rating", async () => {
    if (!softFontAvailable()) return;
    const art = await sharp({
      create: { width: 600, height: 900, channels: 3, background: "#335577" },
    })
      .png()
      .toBuffer();
    const overlay = parsePosterOverlayQuery(new URLSearchParams("trend=1"));
    for (const ratingValueTen of [8.4, null]) {
      const out = await renderSoftPoster({
        imageBuffer: art,
        artTextless: true,
        overlay,
        genreNames: ["Science Fiction"],
        ratingValueTen,
        ratingColorSource: "imdb",
        trendBadges: [{ text: "Top 10 today", kind: "trend" }],
        qualityMarkIds: [],
        ageBadge: null,
        logoPath: null,
      });
      expect(out).not.toBeNull();
      const meta = await sharp(out!).metadata();
      expect(meta.width).toBe(500);
      expect(meta.height).toBe(750);
    }
  });
});

describe("logoScrimAlpha", () => {
  test("leaves light logos on dark art alone", () => {
    expect(logoScrimAlpha(0.9, 0.05)).toBe(0);
  });

  test("darkens bright art behind a white logo enough for 3:1, capped", () => {
    const alpha = logoScrimAlpha(1, 0.8);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(0.6);
    expect(logoScrimAlpha(1, 0.4)).toBeLessThan(alpha);
  });

  test("never scrims dark logos", () => {
    expect(logoScrimAlpha(0.1, 0.9)).toBe(0);
  });
});

describe("logoLegibleShare", () => {
  const sample = (logo: number[], backdrop: number[]) => ({
    logoLum: Float64Array.from(logo),
    weight: Float64Array.from(logo.map(() => 1)),
    backdropLum: Float64Array.from(backdrop),
  });

  test("counts a white logo on dark art as fully legible", () => {
    expect(logoLegibleShare(sample([1, 1], [0.02, 0.03]), 0)).toBe(1);
  });

  test("catches the dark half of a two-tone logo on dark art", () => {
    expect(logoLegibleShare(sample([0.02, 1], [0.03, 0.03]), 0)).toBe(0.5);
  });

  test("credits the scrim when it darkens bright art", () => {
    const bright = sample([1], [0.5]);
    expect(logoLegibleShare(bright, 0)).toBe(0);
    expect(logoLegibleShare(bright, 0.6)).toBe(1);
  });
});
