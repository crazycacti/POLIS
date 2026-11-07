import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { writePolisDiskJson } from "@/lib/polis-disk-cache";
import {
  fetchTmdbTrendingRank,
  MAX_TREND_RANK,
  TMDB_TRENDING_TTL_SEC,
  tmdbTrendingUrl,
  trendingRankIn,
} from "@/lib/tmdb-trending-rank";

describe("trendingRankIn", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i }));

  test("returns the 1-based place in today's list", () => {
    expect(trendingRankIn(rows, 100)).toBe(1);
    expect(trendingRankIn(rows, 103)).toBe(4);
  });

  test("ignores titles below the shown range or missing", () => {
    expect(trendingRankIn(rows, 100 + MAX_TREND_RANK)).toBeNull();
    expect(trendingRankIn(rows, 999)).toBeNull();
    expect(trendingRankIn([], 100)).toBeNull();
  });
});

describe("fetchTmdbTrendingRank", () => {
  const CREDENTIAL = { kind: "api_key", key: "trend-memory-tmdb" } as const;
  const HIT = { stremioType: "movie", tmdbId: 102 } as const;
  const realFetch = globalThis.fetch;
  const savedEnv = { ...process.env };
  let root = "";
  let trendingCalls = 0;
  const ALMOST_EXPIRED_MS = 100;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "polis-trend-"));
    process.env.POLIS_CACHE_DIR = root;
    delete process.env.POLIS_CACHE_DISABLE;
    trendingCalls = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL) => {
      trendingCalls += 1;
      return Response.json({ results: Array.from({ length: 20 }, (_, i) => ({ id: 100 + i })) });
    }) as typeof fetch;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    process.env = { ...savedEnv };
    await rm(root, { recursive: true, force: true });
  });

  test("answers repeat lookups from memory without reading the stored page again", async () => {
    expect(await fetchTmdbTrendingRank(HIT, CREDENTIAL, "en-US")).toBe(3);
    await rm(path.join(root, "api"), { recursive: true, force: true });
    expect(await fetchTmdbTrendingRank(HIT, CREDENTIAL, "en-US")).toBe(3);
    expect(trendingCalls).toBe(1);
  });

  test("drops the remembered page when the stored page reaches the trending TTL", async () => {
    const url = tmdbTrendingUrl("movie", "fr-FR");
    const storedAt = Date.now() - TMDB_TRENDING_TTL_SEC * 1000 + ALMOST_EXPIRED_MS;
    await writePolisDiskJson("api/tmdb", "g", `${url.pathname}${url.search}`, {
      at: storedAt,
      value: { results: [{ id: 102 }] },
    });
    expect(await fetchTmdbTrendingRank(HIT, CREDENTIAL, "fr-FR")).toBe(1);
    expect(trendingCalls).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, ALMOST_EXPIRED_MS * 2));
    expect(await fetchTmdbTrendingRank(HIT, CREDENTIAL, "fr-FR")).toBe(3);
    expect(trendingCalls).toBe(1);
  });
});
