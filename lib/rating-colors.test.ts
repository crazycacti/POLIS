import { describe, expect, test } from "bun:test";

import { ratingDisplayColor } from "@/lib/rating-colors";

describe("ratingDisplayColor", () => {
  test("Rotten Tomatoes is fresh at 60% and up", () => {
    expect(ratingDisplayColor("tomatoes", 6)).toBe("#14ae5c");
    expect(ratingDisplayColor("tomatoes", 5.9)).toBe("#fa320a");
  });

  test("Metascore uses the film and TV bands", () => {
    expect(ratingDisplayColor("metacritic", 6.1)).toBe("#6bb83a");
    expect(ratingDisplayColor("metacritic", 6)).toBe("#ffbd3f");
    expect(ratingDisplayColor("metacritic", 4)).toBe("#ffbd3f");
    expect(ratingDisplayColor("metacritic", 3.9)).toBe("#ff5d4d");
  });

  test("Metacritic user score uses its own bands", () => {
    expect(ratingDisplayColor("metacriticuser", 7.5)).toBe("#6bb83a");
    expect(ratingDisplayColor("metacriticuser", 7.4)).toBe("#ffbd3f");
    expect(ratingDisplayColor("metacriticuser", 4.9)).toBe("#ff5d4d");
  });
});
