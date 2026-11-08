import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

import { parsePosterOverlayQuery } from "@/lib/poster-query";
import { renderSoftPoster } from "@/lib/render-poster-soft";

describe("renderSoftPoster with a logo that cannot load", () => {
  it("still renders the poster and reports the logo failure", async () => {
    const art = await readFile("public/demo-art/fallout.jpg");
    const realFetch = globalThis.fetch;
    const realWarn = console.warn;
    console.warn = () => {};
    globalThis.fetch = (async (_input: RequestInfo | URL): Promise<Response> => {
      throw new TypeError("logo host unreachable");
    }) as typeof fetch;
    let failures = 0;
    try {
      const image = await renderSoftPoster({
        imageBuffer: art,
        artTextless: true,
        overlay: parsePosterOverlayQuery(new URLSearchParams()),
        genreNames: [],
        ratingValueTen: 8.1,
        ratingColorSource: "imdb",
        trendBadges: [],
        qualityMarkIds: [],
        ageBadge: null,
        logoPath: "/logo-that-fails-to-load.png",
        onLogoFailed: () => {
          failures += 1;
        },
      });
      expect(image).not.toBeNull();
      expect(failures).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = realFetch;
      console.warn = realWarn;
    }
  });
});
