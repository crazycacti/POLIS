import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { parsePosterOverlayQuery, serializePosterQuery } from "@/lib/poster-query";
import { softFontAvailable } from "@/lib/poster-soft-font";
import { renderSoftPoster } from "@/lib/render-poster-soft";

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
