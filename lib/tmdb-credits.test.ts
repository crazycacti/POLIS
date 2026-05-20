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
});
