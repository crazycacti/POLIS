import { describe, expect, test } from "bun:test";

import { posterRenderCacheKey } from "@/lib/poster-render-cache";
import { serializePosterQuery, POSTER_OVERLAY_DEFAULTS } from "@/lib/poster-query";

describe("posterRenderCacheKey", () => {
  test("canonicalizes equivalent overlay params", () => {
    const a = posterRenderCacheKey({
      imdbId: "tt0111161",
      overlayQueryString: serializePosterQuery(POSTER_OVERLAY_DEFAULTS),
      language: "en-US",
      configId: "abc123",
    });
    const b = posterRenderCacheKey({
      imdbId: "tt0111161",
      overlayQueryString: serializePosterQuery({
        ...POSTER_OVERLAY_DEFAULTS,
        genre: true,
        rating: true,
      }),
      language: "en-US",
      configId: "abc123",
    });
    expect(a).toBe(b);
  });

  test("differs by config id and imdb id", () => {
    const qs = serializePosterQuery(POSTER_OVERLAY_DEFAULTS);
    const base = posterRenderCacheKey({
      imdbId: "tt0111161",
      overlayQueryString: qs,
      language: "en-US",
      configId: "cfg-a",
    });
    expect(
      posterRenderCacheKey({
        imdbId: "tt0068646",
        overlayQueryString: qs,
        language: "en-US",
        configId: "cfg-a",
      }),
    ).not.toBe(base);
    expect(
      posterRenderCacheKey({
        imdbId: "tt0111161",
        overlayQueryString: qs,
        language: "en-US",
        configId: "cfg-b",
      }),
    ).not.toBe(base);
  });
});
