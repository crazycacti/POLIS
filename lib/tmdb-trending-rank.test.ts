import { describe, expect, test } from "bun:test";

import { MAX_TREND_RANK, trendingRankIn } from "@/lib/tmdb-trending-rank";

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
