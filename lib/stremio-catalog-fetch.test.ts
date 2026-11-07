import { describe, expect, it } from "bun:test";

import { fetchPolisCatalogMetas } from "@/lib/stremio-catalog-fetch";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";

const liveMdblistKey = process.env.POLIS_LIVE_TESTS === "1" ? process.env.MDBLIST_API_KEY?.trim() : undefined;

describe.skipIf(!liveMdblistKey)("fetchMdblistCatalogMetas against live MDBList", () => {
  it("returns metas for a public list", async () => {
    const apiKey = liveMdblistKey ?? "";

    // Hard-coded list ids get deleted upstream; pick a current public movie list instead.
    const topUrl = new URL("https://api.mdblist.com/lists/top");
    topUrl.searchParams.set("apikey", apiKey);
    const top = (await (await fetch(topUrl)).json()) as { id?: number; mediatype?: string; items?: number }[];
    const list = top.find((row) => row.mediatype === "movie" && (row.items ?? 0) > 0);
    expect(list?.id).toBeDefined();

    const def: PolisCatalogDefinition = {
      id: `mdblist-list-${list!.id}-movie`,
      type: "movie",
      name: "Top list",
      provider: { kind: "mdblist", list: "list", listId: String(list!.id) },
    };

    const metas = await fetchPolisCatalogMetas({
      type: "movie",
      catalogId: def.id,
      credential: null,
      mdblistApiKey: apiKey,
      language: "en-US",
      publicBase: "http://localhost:3050/test",
      extra: new URLSearchParams(),
      catalogDefinitions: [def],
    });

    expect(metas.length).toBeGreaterThan(0);
    expect(metas[0]?.id.startsWith("tt")).toBe(true);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and never runs more than the limit at once", async () => {
    const { mapWithConcurrency } = await import("@/lib/stremio-catalog-fetch");
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n));
      active -= 1;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});

describe("tmdb catalog pages", () => {
  const MISSING_IMDB_ID = 5;
  const REPEATED_ROW = 30;
  const REPEATED_ID = 3;
  const def: PolisCatalogDefinition = {
    id: "tmdb-trending",
    type: "movie",
    name: "Trending",
    provider: { kind: "tmdb", list: "trending" },
  };

  async function page(
    skip: number,
    options: { failingExternalId?: number; posterQueryString?: string } = {},
  ) {
    const { failingExternalId, posterQueryString } = options;
    const realFetch = globalThis.fetch;
    const savedCacheFlag = process.env.POLIS_CACHE_DISABLE;
    process.env.POLIS_CACHE_DISABLE = "1";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const external = /\/movie\/(\d+)\/external_ids$/.exec(url.pathname);
      if (external) {
        const id = Number(external[1]);
        if (id === failingExternalId) throw new TypeError("network down");
        return Response.json({ imdb_id: id === MISSING_IMDB_ID ? null : `tt${1000000 + id}` });
      }
      const tmdbPage = Number(url.searchParams.get("page"));
      const results = Array.from({ length: 20 }, (_, i) => {
        const row = (tmdbPage - 1) * 20 + i + 1;
        return { id: row === REPEATED_ROW ? REPEATED_ID : row, title: "T" };
      });
      return Response.json({ results, total_pages: 20 });
    }) as typeof fetch;
    try {
      return await fetchPolisCatalogMetas({
        type: "movie",
        catalogId: def.id,
        credential: { kind: "api_key", key: "test" },
        mdblistApiKey: null,
        language: "en-US",
        publicBase: "http://localhost:3050",
        extra: new URLSearchParams(skip ? { skip: String(skip) } : {}),
        catalogDefinitions: [def],
        posterQueryString,
      });
    } finally {
      globalThis.fetch = realFetch;
      if (savedCacheFlag == null) delete process.env.POLIS_CACHE_DISABLE;
      else process.env.POLIS_CACHE_DISABLE = savedCacheFlag;
    }
  }

  it("marks every preview landscape when the poster query asks for it", async () => {
    const metas = await page(0, { posterQueryString: "rating=1&shape=landscape" });
    expect(metas.length).toBeGreaterThan(0);
    expect(metas.every((m) => m.posterShape === "landscape")).toBe(true);
    expect(metas[0]?.poster).toContain("shape=landscape");
  });

  it("keeps previews portrait by default", async () => {
    const metas = await page(0);
    expect(metas.every((m) => m.posterShape === "poster")).toBe(true);
  });

  it("returns 20 titles and skips ones without an imdb id", async () => {
    const metas = await page(0);
    expect(metas).toHaveLength(20);
    expect(metas.map((m) => m.id)).not.toContain(`tt${1000000 + MISSING_IMDB_ID}`);
    expect(metas[0]?.id).toBe("tt1000001");
    expect(metas.at(-1)?.id).toBe("tt1000021");
    expect(metas[0]?.poster).toContain("trend_rank=1");
  });

  it("continues after the last title sent, without repeating one", async () => {
    const first = await page(0);
    const second = await page(20);
    expect(second[0]?.id).toBe("tt1000022");
    expect(second.filter((m) => first.some((f) => f.id === m.id))).toEqual([]);
    expect(second.map((m) => m.id)).not.toContain(`tt${1000000 + REPEATED_ROW}`);
    expect(second.at(-1)?.id).toBe("tt1000042");
    expect((await page(7))[0]?.id).toBe("tt1000009");
  });

  it("starts at the raw row past the exact skip limit", async () => {
    expect((await page(220))[0]?.id).toBe("tt1000221");
  });

  it("drops a row whose external id request throws and keeps the rest of the page", async () => {
    const FAILING_ID = 2;
    const realWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const metas = await page(0, { failingExternalId: FAILING_ID });
      expect(metas).toHaveLength(20);
      expect(metas.map((m) => m.id)).not.toContain(`tt${1000000 + FAILING_ID}`);
      expect(warnings.filter((w) => w.includes("tmdb catalog rows failed"))).toHaveLength(1);
      expect(warnings.join("\n")).not.toContain("api_key=test");
    } finally {
      console.warn = realWarn;
    }
  });
});

describe("mdblist catalog failures", () => {
  it("returns no titles and logs the failure without the api key when the request throws", async () => {
    const apiKey = "secret-test-key";
    const def: PolisCatalogDefinition = {
      id: "mdblist-watchlist-movie",
      type: "movie",
      name: "Watchlist",
      provider: { kind: "mdblist", list: "watchlist" },
    };
    const realFetch = globalThis.fetch;
    const realWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      throw new TypeError(`failed to reach ${input instanceof Request ? input.url : String(input)}`);
    }) as typeof fetch;
    try {
      const metas = await fetchPolisCatalogMetas({
        type: "movie",
        catalogId: def.id,
        credential: null,
        mdblistApiKey: apiKey,
        language: "en-US",
        publicBase: "http://localhost:3050",
        extra: new URLSearchParams(),
        catalogDefinitions: [def],
      });
      expect(metas).toEqual([]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(def.id);
      expect(warnings[0]).not.toContain(apiKey);
    } finally {
      globalThis.fetch = realFetch;
      console.warn = realWarn;
    }
  });
});

describe("mdblist catalog rate limits", () => {
  it("stops calling MDBList for that key after a 429", async () => {
    const def: PolisCatalogDefinition = {
      id: "mdblist-watchlist-movie",
      type: "movie",
      name: "Watchlist",
      provider: { kind: "mdblist", list: "watchlist" },
    };
    const realFetch = globalThis.fetch;
    const realWarn = console.warn;
    let calls = 0;
    console.warn = () => {};
    globalThis.fetch = (async (_input: RequestInfo | URL): Promise<Response> => {
      calls += 1;
      return new Response("{}", { status: 429, headers: { "retry-after": "600" } });
    }) as typeof fetch;
    try {
      const request = () =>
        fetchPolisCatalogMetas({
          type: "movie",
          catalogId: def.id,
          credential: null,
          mdblistApiKey: "catalog-429-key",
          language: "en-US",
          publicBase: "http://localhost:3050",
          extra: new URLSearchParams(),
          catalogDefinitions: [def],
        });
      expect(await request()).toEqual([]);
      expect(await request()).toEqual([]);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
      console.warn = realWarn;
    }
  });
});
