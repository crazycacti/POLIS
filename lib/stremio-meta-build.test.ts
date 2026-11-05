import { describe, expect, test } from "bun:test";

import { buildStremioMetaRecord } from "@/lib/stremio-meta-build";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";

function resolvedTitle(overrides: Partial<ResolvedTitle> = {}): ResolvedTitle {
  return {
    imdbId: "tt0000001",
    stremioType: "movie",
    title: "Test",
    overview: "",
    releaseYear: "2020",
    releaseInfo: "2020",
    releasedIso: null,
    lastAirDateIso: null,
    status: null,
    runtimeMinutes: null,
    posterPath: "/p.jpg",
    backdropPath: null,
    voteAverage: null,
    voteCount: null,
    genreNames: [],
    cast: ["Lead", "Second"],
    castMembers: [
      { name: "Lead", character: "Hero", profilePath: "/lead.jpg" },
      { name: "Second", character: null, profilePath: null },
    ],
    directors: [],
    country: null,
    tmdbNumericId: 1,
    tvdbId: null,
    logoPath: "/logo.png",
    certification: null,
    videos: null,
    ...overrides,
  };
}

describe("buildStremioMetaRecord", () => {
  test("sends the logo when the poster also draws it", () => {
    const meta = buildStremioMetaRecord(resolvedTitle(), "https://polis.test", undefined, "logo=1");
    expect(meta.logo).toBe("https://polis.test/logo/imdb/default/tt0000001.png");
  });

  test("omits the logo when the title has none", () => {
    const meta = buildStremioMetaRecord(resolvedTitle({ logoPath: null }), "https://polis.test", undefined, undefined);
    expect(meta.logo).toBeUndefined();
  });

  test("adds cast photos and characters while keeping plain cast names", () => {
    const meta = buildStremioMetaRecord(resolvedTitle(), "https://polis.test", undefined, undefined);
    expect(meta.cast).toEqual(["Lead", "Second"]);
    expect(meta.app_extras).toEqual({
      cast: [
        { name: "Lead", character: "Hero", photo: "https://image.tmdb.org/t/p/w185/lead.jpg" },
        { name: "Second" },
      ],
    });
  });

  test("does not label the TMDB vote average as an IMDb rating", () => {
    const meta = buildStremioMetaRecord(resolvedTitle({ voteAverage: 7.4 }), "https://polis.test", undefined, undefined);
    expect(meta.imdbRating).toBeUndefined();
  });

  test("leaves out app_extras when there is no cast", () => {
    const meta = buildStremioMetaRecord(
      resolvedTitle({ cast: [], castMembers: [] }),
      "https://polis.test",
      undefined,
      undefined,
    );
    expect(meta.app_extras).toBeUndefined();
  });
});
