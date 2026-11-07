import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import {
  LANDSCAPE_HEIGHT,
  LANDSCAPE_WIDTH,
  landscapeFromPortrait,
  pickLandscapeBackdrop,
  rankLandscapeBackdrops,
} from "@/lib/landscape-artwork";
import { parsePosterOverlayQuery } from "@/lib/poster-query";
import { LANDSCAPE_BYTE_BUDGET, renderLandscapeSoft } from "@/lib/render-landscape-soft";

const NOISE_W = 96;
const NOISE_H = 54;

async function texturedArt(): Promise<Buffer> {
  const data = Buffer.alloc(NOISE_W * NOISE_H * 3);
  let seed = 7;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    data[i] = (seed >> 16) & 0xff;
  }
  return sharp(data, { raw: { width: NOISE_W, height: NOISE_H, channels: 3 } })
    .resize(1280, 720, { kernel: "cubic" })
    .jpeg()
    .toBuffer();
}

describe("renderLandscapeSoft", () => {
  test("renders a 960x540 image under the size budget with every info item", async () => {
    const out = await renderLandscapeSoft({
      imageBuffer: await texturedArt(),
      artTextless: true,
      overlay: parsePosterOverlayQuery(new URLSearchParams("shape=landscape&trend=1&quality=1&age=1")),
      ratingValueTen: 8.1,
      ratingColorSource: "imdb",
      trendBadges: [{ text: "Top 10 today", kind: "trend" }],
      qualityMarkIds: ["4k", "dolby", "hdr"],
      ageBadge: { text: "PG-13", kind: "age" },
      logoPath: null,
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(LANDSCAPE_WIDTH);
    expect(meta.height).toBe(LANDSCAPE_HEIGHT);
    expect(out.length).toBeLessThanOrEqual(LANDSCAPE_BYTE_BUDGET);
  });

  test("crops portrait art to 16:9", async () => {
    const art = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#335577" } })
      .png()
      .toBuffer();
    const out = await renderLandscapeSoft({
      imageBuffer: art,
      artTextless: false,
      overlay: parsePosterOverlayQuery(new URLSearchParams("shape=landscape&rating=0&trend=0")),
      ratingValueTen: null,
      ratingColorSource: null,
      trendBadges: [],
      qualityMarkIds: [],
      ageBadge: null,
      logoPath: null,
    });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT]);
  });
});

describe("pickLandscapeBackdrop", () => {
  test("prefers the best voted textless backdrop", () => {
    const pick = pickLandscapeBackdrop(
      [
        { file_path: "/titled.jpg", iso_639_1: "en", vote_average: 9 },
        { file_path: "/plain-low.jpg", iso_639_1: null, vote_average: 4 },
        { file_path: "/plain-high.jpg", iso_639_1: null, vote_average: 6 },
      ],
      "/default.jpg",
    );
    expect(pick).toEqual({ path: "/plain-high.jpg", textless: true });
  });

  test("falls back to the default backdrop, textless only when listed without a language", () => {
    expect(pickLandscapeBackdrop([{ file_path: "/a.jpg", iso_639_1: "en" }], "/a.jpg")).toEqual({
      path: "/a.jpg",
      textless: false,
    });
    expect(pickLandscapeBackdrop([], "/b.jpg")).toEqual({ path: "/b.jpg", textless: false });
    expect(pickLandscapeBackdrop([], null)).toBeNull();
  });

  test("ignores paths that are not plain TMDB file names", () => {
    expect(
      pickLandscapeBackdrop([{ file_path: "/../evil.jpg", iso_639_1: null }], "//host/x.jpg"),
    ).toBeNull();
  });
});

describe("landscape fallbacks", () => {
  test("ranks textless backdrops by votes and keeps the default backdrop as a last try", () => {
    const ranked = rankLandscapeBackdrops(
      [
        { file_path: "/low.jpg", iso_639_1: null, vote_average: 2 },
        { file_path: "/titled.jpg", iso_639_1: "en", vote_average: 9 },
        { file_path: "/high.jpg", iso_639_1: null, vote_average: 8 },
      ],
      "/titled.jpg",
    );
    expect(ranked).toEqual([
      { path: "/high.jpg", textless: true },
      { path: "/low.jpg", textless: true },
      { path: "/titled.jpg", textless: false },
    ]);
  });

  test("returns no candidates when nothing is a safe image path", () => {
    expect(rankLandscapeBackdrops([{ file_path: "/../x.jpg", iso_639_1: null }], "https://evil/x.jpg")).toEqual([]);
  });

  test("puts portrait art on a 16:9 canvas when no backdrop works", async () => {
    const portrait = await sharp({
      create: { width: 500, height: 750, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await landscapeFromPortrait(portrait)).metadata();
    expect([meta.width, meta.height]).toEqual([LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT]);
  });
});
