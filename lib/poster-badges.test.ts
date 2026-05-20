import { describe, expect, test } from "bun:test";

import { pickBestTrendBadge } from "@/lib/poster-badges";
import type { MdblistMediaInfo } from "@/lib/mdblist-client";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";

function baseResolved(overrides: Partial<ResolvedTitle> = {}): ResolvedTitle {
  return {
    imdbId: "tt0000001",
    stremioType: "movie",
    title: "Test",
    overview: "",
    releaseYear: "2020",
    releaseInfo: "2020",
    releasedIso: "2020-01-01T00:00:00.000Z",
    lastAirDateIso: null,
    status: null,
    runtimeMinutes: 120,
    posterPath: "/p.jpg",
    backdropPath: null,
    voteAverage: 7,
    voteCount: 100,
    genreNames: [],
    cast: [],
    directors: [],
    country: null,
    tmdbNumericId: 1,
    tvdbId: null,
    logoPath: null,
    certification: null,
    videos: null,
    ...overrides,
  };
}

function mdblist(keywordNames: string[]): MdblistMediaInfo {
  return {
    ratings: {},
    releaseDate: null,
    status: null,
    keywordNames,
    certification: null,
    filenames: [],
  };
}

describe("pickBestTrendBadge", () => {
  test("prefers trending rank over certified fresh", () => {
    const badge = pickBestTrendBadge({
      resolved: baseResolved(),
      mdblist: mdblist(["certified-fresh"]),
      trendRank: 1,
    });
    expect(badge?.text).toBe("#1 Trending");
  });

  test("prefers new episode over certified fresh for returning series", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 3);
    const badge = pickBestTrendBadge({
      resolved: baseResolved({
        stremioType: "series",
        status: "Returning Series",
        lastAirDateIso: recent.toISOString(),
      }),
      mdblist: mdblist(["certified-fresh"]),
    });
    expect(badge?.text).toBe("New Episode");
  });

  test("uses returning series when no recent episode", () => {
    const badge = pickBestTrendBadge({
      resolved: baseResolved({
        stremioType: "series",
        status: "Returning Series",
        lastAirDateIso: "2020-01-01T00:00:00.000Z",
      }),
      mdblist: mdblist(["certified-fresh"]),
    });
    expect(badge?.text).toBe("Returning Series");
  });

  test("does not match fresh inside unrelated slugs", () => {
    const badge = pickBestTrendBadge({
      resolved: baseResolved({ voteAverage: 6, voteCount: 10 }),
      mdblist: mdblist(["fresh-fish", "tax-return"]),
    });
    expect(badge).toBeNull();
  });

  test("oscar winner beats certified fresh", () => {
    const badge = pickBestTrendBadge({
      resolved: baseResolved(),
      mdblist: mdblist(["oscar-winner", "certified-fresh"]),
    });
    expect(badge?.text).toBe("Oscar Winner");
  });
});
