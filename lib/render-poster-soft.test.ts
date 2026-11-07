import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { parsePosterOverlayQuery, serializePosterQuery } from "@/lib/poster-query";
import { softFontAvailable } from "@/lib/poster-soft-font";
import { fitTopRow, logoLegibleShare, logoScrimAlpha, ratingCapsuleAt, renderSoftPoster } from "@/lib/render-poster-soft";

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

// Stremio skips poster images over 100 KB, so the busiest look must stay under it.
const STREMIO_POSTER_MAX_BYTES = 100 * 1024;

describe("poster size", () => {
  test("every sample title stays under the poster size limit with all options on", async () => {
    if (!softFontAvailable()) return;
    const { DEMO_TITLES } = await import("@/lib/demo-catalog");
    const { loadDemoArtBuffer } = await import("@/lib/demo-art-cache");
    const overlay = parsePosterOverlayQuery(
      new URLSearchParams("genre=1&rating=1&trend=1&quality=1&age=1&logo=0"),
    );
    for (const demo of DEMO_TITLES) {
      const art = await loadDemoArtBuffer(demo.id);
      expect(art).not.toBeNull();
      const out = await renderSoftPoster({
        imageBuffer: art!,
        artTextless: demo.artTextless,
        overlay,
        genreNames: demo.genreNames,
        ratingValueTen: demo.voteAverage,
        ratingColorSource: "average",
        trendBadges: demo.trendText ? [{ text: demo.trendText, kind: "trend" }] : [],
        qualityMarkIds: demo.qualityMarkIds,
        ageBadge: demo.ageLabel ? { text: demo.ageLabel, kind: "age" } : null,
        logoPath: null,
      });
      expect(out!.length).toBeLessThan(STREMIO_POSTER_MAX_BYTES);
    }
  });
});

describe("fitTopRow", () => {
  const text = (width: number) => ({ kind: "text" as const, text: "x", width });

  test("keeps everything at full size when it fits", () => {
    if (!softFontAvailable()) return;
    const row = fitTopRow({ label: "Top Rated", items: [text(30)], fs: 29, w: 500, padX: 40 });
    expect(row.fs).toBe(29);
    expect(row.items).toHaveLength(1);
  });

  test("never runs wider than the poster, dropping the last marks first", () => {
    if (!softFontAvailable()) return;
    const items = [text(60), text(60), text(60), text(60), text(60)];
    const row = fitTopRow({ label: "Golden Globe Winner", items, fs: 29, w: 500, padX: 40 });
    expect(row.items.length).toBeLessThan(items.length);
    expect(row.fs).toBeGreaterThanOrEqual(Math.round(29 * 0.75));
    expect(row.itemsWidth).toBeLessThanOrEqual(500 - 80);
  });
});

describe("classic score pill", () => {
  test("ends at the right inset and grows to fit the star", () => {
    const plain = ratingCapsuleAt({ valueTen: 8.4, fs: 30, right: 460, centerY: 700, star: false });
    const starred = ratingCapsuleAt({ valueTen: 8.4, fs: 30, right: 460, centerY: 700, star: true });
    expect(plain.rect.left + plain.rect.width).toBe(460);
    expect(starred.rect.left + starred.rect.width).toBe(460);
    expect(starred.rect.width).toBeGreaterThan(plain.rect.width);
    expect(starred.text).toBe("8.4");
  });
});
