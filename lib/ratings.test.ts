import { describe, expect, test } from "bun:test";

import { collectMdblistRatings, mergeRatingScores, resolveRatingDisplay } from "@/lib/ratings";

function label(source: Parameters<typeof resolveRatingDisplay>[0], ratings: unknown) {
  return resolveRatingDisplay(source, collectMdblistRatings({ ratings }), null, "score")?.label ?? null;
}

describe("rating scale", () => {
  test("converts letterboxd and rogerebert once", () => {
    expect(label("letterboxd", [{ source: "letterboxd", value: 2 }])).toBe("4.0");
    expect(label("letterboxd", [{ source: "letterboxd", value: 4.2 }])).toBe("8.4");
    expect(label("rogerebert", [{ source: "rogerebert", value: 1.5 }])).toBe("3.8");
  });

  test("reads low percentages as percentages", () => {
    expect(label("tomatoes", [{ source: "tomatoes", value: 7 }])).toBe("0.7");
    expect(label("metacritic", [{ source: "metacritic", value: 81 }])).toBe("8.1");
    expect(label("trakt", [{ source: "trakt", value: 9 }])).toBe("0.9");
  });

  test("keeps ten-point sources as they are", () => {
    expect(label("imdb", [{ source: "imdb", value: 7.4 }])).toBe("7.4");
    expect(label("metacriticuser", [{ source: "metacriticuser", value: 6.1 }])).toBe("6.1");
  });

  test("falls back to the normalized score and caps at ten", () => {
    expect(label("letterboxd", [{ source: "letterboxd", value: null, score: 70 }])).toBe("7.0");
    expect(label("imdb", [{ source: "imdb", value: 140 }])).toBe("10.0");
  });

  test("averages values already on the ten-point scale", () => {
    const scores = collectMdblistRatings({
      ratings: [
        { source: "letterboxd", value: 2 },
        { source: "tomatoes", value: 7 },
        { source: "imdb", value: 3.1 },
      ],
    });
    const average = resolveRatingDisplay("average", scores, null, "score");
    expect(average?.label).toBe("2.6");
  });

  test("skips missing and zero ratings", () => {
    const scores = collectMdblistRatings({
      ratings: [
        { source: "tomatoes", value: 0 },
        { source: "imdb", value: null },
      ],
    });
    expect(scores).toEqual({});
    expect(resolveRatingDisplay("average", mergeRatingScores(scores, null), null, "score")).toBeNull();
  });
});
