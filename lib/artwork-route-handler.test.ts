import { afterEach, describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";

import { handleBackdropRequest } from "@/lib/artwork-route-handler";

const savedLimit = process.env.POLIS_POSTER_RENDERS_PER_CLIENT_PER_MIN;

afterEach(() => {
  if (savedLimit === undefined) delete process.env.POLIS_POSTER_RENDERS_PER_CLIENT_PER_MIN;
  else process.env.POLIS_POSTER_RENDERS_PER_CLIENT_PER_MIN = savedLimit;
});

describe("artwork routes", () => {
  it("limit how many new backdrops one client can start a minute", async () => {
    process.env.POLIS_POSTER_RENDERS_PER_CLIENT_PER_MIN = "1";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL): Promise<Response> =>
      Response.json({ movie_results: [], tv_results: [] })) as typeof fetch;
    try {
      const request = (imdbId: string) =>
        new NextRequest(`http://localhost:3050/backdrop/imdb/default/${imdbId}.jpg?api_key=artwork-limit-test-key`, {
          headers: { "x-forwarded-for": "203.0.113.77" },
        });
      const first = await handleBackdropRequest(request("tt5550001"), "tt5550001", null);
      expect(first.status).toBe(404);
      const second = await handleBackdropRequest(request("tt5550002"), "tt5550002", null);
      expect(second.status).toBe(429);
      expect(second.headers.get("retry-after")).not.toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
