import { describe, expect, test } from "bun:test";

import { posterLatestAliasKey, posterRenderCacheKey } from "@/lib/poster-render-cache";
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
        genre: false,
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

  test("the latest alias ignores the trending rank but not the look", () => {
    const base = { imdbId: "tt0111161", language: "en-US", configId: "cfg-a" };
    const ranked = (trendRank: number | null) =>
      serializePosterQuery({ ...POSTER_OVERLAY_DEFAULTS, trendRank });
    expect(posterLatestAliasKey({ ...base, overlayQueryString: ranked(1) })).toBe(
      posterLatestAliasKey({ ...base, overlayQueryString: ranked(7) }),
    );
    expect(posterRenderCacheKey({ ...base, overlayQueryString: ranked(1) })).not.toBe(
      posterRenderCacheKey({ ...base, overlayQueryString: ranked(7) }),
    );
    expect(
      posterLatestAliasKey({
        ...base,
        overlayQueryString: serializePosterQuery({ ...POSTER_OVERLAY_DEFAULTS, genre: true }),
      }),
    ).not.toBe(posterLatestAliasKey({ ...base, overlayQueryString: ranked(null) }));
  });
});
