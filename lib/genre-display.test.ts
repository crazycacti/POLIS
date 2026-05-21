import { describe, expect, test } from "bun:test";

import { formatGenreDisplayName } from "@/lib/genre-display";
import { normalizeGenreLabel } from "@/lib/poster-footer-pill";

describe("formatGenreDisplayName", () => {
  test("shortens Science Fiction to Sci-Fi", () => {
    expect(formatGenreDisplayName("Science Fiction")).toBe("Sci-Fi");
  });

  test("shortens Sci-Fi & Fantasy to Sci-Fi", () => {
    expect(formatGenreDisplayName("Sci-Fi & Fantasy")).toBe("Sci-Fi");
  });

  test("uses first segment for combined TMDB genres", () => {
    expect(formatGenreDisplayName("Action & Adventure")).toBe("Action");
    expect(formatGenreDisplayName("War & Politics")).toBe("War");
  });

  test("leaves short single genres unchanged", () => {
    expect(formatGenreDisplayName("Drama")).toBe("Drama");
  });

  test("normalizeGenreLabel applies display names", () => {
    expect(normalizeGenreLabel(["Science Fiction"], "first")).toBe("Sci-Fi");
    expect(normalizeGenreLabel(["Drama", "Science Fiction", "Crime"], "top3")).toBe(
      "Drama · Sci-Fi · Crime",
    );
  });
});
