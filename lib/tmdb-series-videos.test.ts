import { describe, expect, test } from "bun:test";

import { fetchTmdbSeriesVideos } from "@/lib/tmdb-series-videos";

const SEASON_COUNT = 25;

describe("fetchTmdbSeriesVideos", () => {
  test("requests seasons in batches of 20 and keeps season order", async () => {
    const realFetch = globalThis.fetch;
    const savedCacheFlag = process.env.POLIS_CACHE_DISABLE;
    process.env.POLIS_CACHE_DISABLE = "1";
    const requested: string[][] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const appends = (url.searchParams.get("append_to_response") ?? "").split(",");
      requested.push(appends);
      const body: Record<string, unknown> = { number_of_seasons: SEASON_COUNT };
      for (const key of appends) {
        const season = Number(key.split("/")[1]);
        body[key] = { episodes: [{ episode_number: 1, season_number: season, name: `S${season}` }] };
      }
      return Response.json(body);
    }) as typeof fetch;
    try {
      const videos = await fetchTmdbSeriesVideos({
        tmdbTvId: 1,
        imdbId: "tt0000001",
        credential: { kind: "api_key", key: "test" },
        language: "en-US",
        seasonCount: SEASON_COUNT,
      });
      expect(requested.map((appends) => appends.length).sort((a, b) => b - a)).toEqual([20, 6]);
      expect(videos.map((video) => video.season)).toEqual(
        Array.from({ length: SEASON_COUNT + 1 }, (_, season) => season),
      );
      expect(videos[3]?.id).toBe("tt0000001:3:1");
    } finally {
      globalThis.fetch = realFetch;
      if (savedCacheFlag === undefined) delete process.env.POLIS_CACHE_DISABLE;
      else process.env.POLIS_CACHE_DISABLE = savedCacheFlag;
    }
  });

  test("returns no episodes for an invalid season count", async () => {
    const videos = await fetchTmdbSeriesVideos({
      tmdbTvId: 1,
      imdbId: "tt0000001",
      credential: { kind: "api_key", key: "test" },
      language: "en-US",
      seasonCount: Number.NaN,
    });
    expect(videos).toEqual([]);
  });
});
