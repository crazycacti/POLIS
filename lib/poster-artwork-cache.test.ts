import { describe, expect, test } from "bun:test";

import { posterArtworkCacheKey } from "@/lib/poster-artwork-cache";
import {
  parsePosterOverlayQuery,
  POSTER_OVERLAY_DEFAULTS,
  serializePosterQuery,
} from "@/lib/poster-query";

describe("posterArtworkCacheKey", () => {
  const base = {
    imdbId: "tt0111161",
    language: "en-US",
    configId: "cfg-a",
    artwork: POSTER_OVERLAY_DEFAULTS.artwork,
    artworkMovie: POSTER_OVERLAY_DEFAULTS.artworkMovie,
    artworkFallback: POSTER_OVERLAY_DEFAULTS.artworkFallback,
    logoOnPoster: POSTER_OVERLAY_DEFAULTS.logoOnPoster,
  };

  test("ignores footer inset and other overlay style params", () => {
    const low = parsePosterOverlayQuery(
      new URLSearchParams(serializePosterQuery({ ...POSTER_OVERLAY_DEFAULTS, padY: 16 })),
    );
    const high = parsePosterOverlayQuery(
      new URLSearchParams(serializePosterQuery({ ...POSTER_OVERLAY_DEFAULTS, padY: 72 })),
    );
    const keyLow = posterArtworkCacheKey({
      ...base,
      artwork: low.artwork,
      artworkMovie: low.artworkMovie,
      artworkFallback: low.artworkFallback,
      logoOnPoster: low.logoOnPoster,
    });
    const keyHigh = posterArtworkCacheKey({
      ...base,
      artwork: high.artwork,
      artworkMovie: high.artworkMovie,
      artworkFallback: high.artworkFallback,
      logoOnPoster: high.logoOnPoster,
    });
    expect(keyLow).toBe(keyHigh);
  });

  test("changes when artwork source changes", () => {
    const a = posterArtworkCacheKey(base);
    const b = posterArtworkCacheKey({ ...base, artwork: "fanart" });
    expect(a).not.toBe(b);
  });
});
