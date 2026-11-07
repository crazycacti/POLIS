import { describe, expect, test } from "bun:test";

import { resolveTitleForArtwork } from "@/lib/tmdb-resolve";

describe("resolveTitleForArtwork", () => {
  test("asks tmdb for certification, images and ids without credits", async () => {
    const realFetch = globalThis.fetch;
    const savedCacheFlag = process.env.POLIS_CACHE_DISABLE;
    process.env.POLIS_CACHE_DISABLE = "1";
    const appends: string[][] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      appends.push((url.searchParams.get("append_to_response") ?? "").split(","));
      return Response.json({
        title: "Example",
        release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] }] },
        images: { posters: [{ file_path: "/p.jpg", iso_639_1: "en" }], logos: [], backdrops: [] },
        external_ids: { tvdb_id: 42 },
      });
    }) as typeof fetch;
    try {
      const resolved = await resolveTitleForArtwork("tt0000042", { kind: "api_key", key: "test" }, "en-US", {
        stremioType: "movie",
        tmdbId: 42,
      });
      expect(appends).toEqual([["release_dates", "images", "external_ids"]]);
      expect(resolved?.certification).toBe("PG-13");
      expect(resolved?.tvdbId).toBe(42);
      expect(resolved?.posterImages?.length).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
      if (savedCacheFlag === undefined) delete process.env.POLIS_CACHE_DISABLE;
      else process.env.POLIS_CACHE_DISABLE = savedCacheFlag;
    }
  });
});
