import { describe, expect, test } from "bun:test";

import { parseTmdbCredits } from "@/lib/tmdb-credits-parse";

describe("parseTmdbCredits", () => {
  test("orders cast by billing and includes directors", () => {
    const parsed = parseTmdbCredits(
      {
        cast: [
          { name: "B Actor", order: 2 },
          { name: "A Lead", order: 0 },
        ],
        crew: [{ name: "Jane Director", job: "Director" }],
      },
      "movie",
    );
    expect(parsed.cast).toEqual(["A Lead", "B Actor"]);
    expect(parsed.directors).toEqual(["Jane Director"]);
  });

  test("series uses Creator as director", () => {
    const parsed = parseTmdbCredits(
      {
        cast: [{ name: "Star", order: 0 }],
        crew: [{ name: "Showrunner", job: "Creator" }],
      },
      "series",
    );
    expect(parsed.directors).toEqual(["Showrunner"]);
  });

  test("keeps character and photo path for each cast member", () => {
    const parsed = parseTmdbCredits(
      {
        cast: [
          { name: "Lead", order: 0, character: "Hero", profile_path: "/abc123.jpg" },
          { name: "Second", order: 1, roles: [{ character: "Sidekick" }], profile_path: null },
          { name: "Third", order: 2, character: "  ", profile_path: "/../x.jpg?y" },
        ],
      },
      "series",
    );
    expect(parsed.cast).toEqual(["Lead", "Second", "Third"]);
    expect(parsed.castMembers).toEqual([
      { name: "Lead", character: "Hero", profilePath: "/abc123.jpg" },
      { name: "Second", character: "Sidekick", profilePath: null },
      { name: "Third", character: null, profilePath: null },
    ]);
  });
});
