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
    const savedCatalogsFlag = process.env.POLIS_ENABLE_CATALOGS;
    process.env.POLIS_ENABLE_CATALOGS = "1";
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
      if (savedCatalogsFlag === undefined) delete process.env.POLIS_ENABLE_CATALOGS;
      else process.env.POLIS_ENABLE_CATALOGS = savedCatalogsFlag;
    }
  });
});

describe("handleStremioCatalogRequest partial pages", () => {
  it("gives every concurrent request for a partial page the short cache time", async () => {
    const saved = { catalogs: process.env.POLIS_ENABLE_CATALOGS, cache: process.env.POLIS_CACHE_DISABLE };
    process.env.POLIS_ENABLE_CATALOGS = "1";
    process.env.POLIS_CACHE_DISABLE = "1";
    const realFetch = globalThis.fetch;
    const realWarn = console.warn;
    console.warn = () => {};
    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const external = /\/movie\/(\d+)\/external_ids$/.exec(url.pathname);
      if (external) {
        if (external[1] === "2") throw new TypeError("network down");
        return Response.json({ imdb_id: `tt${2000000 + Number(external[1])}` });
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return Response.json({ results: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, title: "T" })), total_pages: 1 });
    }) as typeof fetch;
    try {
      const request = () =>
        handleStremioCatalogRequest(
          new NextRequest("http://localhost:3050/catalog/movie/tmdb-trending.json?api_key=partial-page-test-key"),
          null,
          "movie",
          "tmdb-trending.json",
        );
      const responses = await Promise.all([request(), request()]);
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("public, max-age=30");
      }
    } finally {
      globalThis.fetch = realFetch;
      console.warn = realWarn;
      if (saved.catalogs === undefined) delete process.env.POLIS_ENABLE_CATALOGS;
      else process.env.POLIS_ENABLE_CATALOGS = saved.catalogs;
      if (saved.cache === undefined) delete process.env.POLIS_CACHE_DISABLE;
      else process.env.POLIS_CACHE_DISABLE = saved.cache;
    }
  });
});

