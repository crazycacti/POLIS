import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";

import { handleStremioCatalogRequest, handleStremioMetaRequest } from "@/lib/stremio-handlers";

describe("handleStremioMetaRequest upstream failures", () => {
  it("answers with an empty meta and CORS headers when TMDB cannot be reached", async () => {
    const realFetch = globalThis.fetch;
    const realWarn = console.warn;
    console.warn = () => {};
    globalThis.fetch = (async (_input: RequestInfo | URL): Promise<Response> => {
      throw new TypeError("network down");
    }) as typeof fetch;
    try {
      const request = new NextRequest(
        "http://localhost:3050/meta/movie/tt7654320.json?api_key=handler-failure-test-key",
      );
      const response = await handleStremioMetaRequest(request, null, "movie", "tt7654320.json");
      expect(response.status).toBe(502);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(await response.json()).toEqual({ meta: {} });
    } finally {
      globalThis.fetch = realFetch;
      console.warn = realWarn;
    }
  });
});

describe("handleStremioCatalogRequest upstream failures", () => {
  it("answers with no titles and CORS headers when TMDB cannot be reached", async () => {
    const realFetch = globalThis.fetch;
    const realWarn = console.warn;
    console.warn = () => {};
    globalThis.fetch = (async (_input: RequestInfo | URL): Promise<Response> => {
      throw new TypeError("network down");
    }) as typeof fetch;
    try {
      const request = new NextRequest(
        "http://localhost:3050/catalog/movie/tmdb-trending.json?api_key=catalog-failure-test-key",
      );
      const response = await handleStremioCatalogRequest(request, null, "movie", "tmdb-trending.json");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.status).toBe(502);
      const body = (await response.json()) as { metas: unknown[] };
      expect(body.metas).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
      console.warn = realWarn;
    }
  });
});
