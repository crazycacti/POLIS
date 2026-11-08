import { describe, expect, it } from "bun:test";

import { resolveTitleFromImdb } from "@/lib/tmdb-resolve";

describe("resolveTitleFromImdb for series", () => {
  it("shows a year range for a canceled series and survives a failed logo lookup", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.startsWith("/3/find/")) {
        return Response.json({ movie_results: [], tv_results: [{ id: 987654 }] });
      }
      if (url.pathname === "/3/tv/987654") {
        return Response.json({
          id: 987654,
          name: "Canceled Show",
          first_air_date: "2019-03-01",
          last_air_date: "2021-05-01",
          status: "Canceled",
          number_of_seasons: 0,
        });
      }
      throw new TypeError("network down");
    }) as typeof fetch;
    try {
      const resolved = await resolveTitleFromImdb({
        imdbId: "tt9876540",
        stremioType: "series",
        credential: { kind: "api_key", key: "resolve-meta-test-key" },
        language: "en-US",
      });
      expect(resolved?.title).toBe("Canceled Show");
      expect(resolved?.releaseInfo).toBe("2019-2021");
      expect(resolved?.partial).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
