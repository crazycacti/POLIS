import { describe, expect, it } from "bun:test";

import { aiometadataArtPatterns, landscapePosterArtUrl } from "@/lib/polis-urls";

describe("aiometadataArtPatterns", () => {
  it("always includes AIO key placeholders for AIOMetadata API list substitution", () => {
    const patterns = aiometadataArtPatterns(
      "https://polis.example",
      "artwork=tmdb&rating=1",
    );
    expect(patterns.posterPattern).toBe(
      "https://polis.example/poster/imdb/poster-default/{imdb_id}.jpg?artwork=tmdb&rating=1&tmdb_key={tmdb_key}&mdblist_key={mdblist_key}&shape={shape}",
    );
  });

  it("includes key placeholders even when overlay query is empty", () => {
    const patterns = aiometadataArtPatterns("https://polis.example", "");
    expect(patterns.posterPattern).toBe(
      "https://polis.example/poster/imdb/poster-default/{imdb_id}.jpg?tmdb_key={tmdb_key}&mdblist_key={mdblist_key}&shape={shape}",
    );
  });

  it("lets AIOMetadata pick the shape and offers a fixed landscape pattern", () => {
    const patterns = aiometadataArtPatterns("https://polis.example", "rating=1&shape=landscape");
    expect(patterns.posterPattern).not.toContain("shape=landscape");
    expect(patterns.posterPattern.endsWith("&shape={shape}")).toBe(true);
    expect(patterns.landscapePattern.endsWith("&shape=landscape")).toBe(true);
  });
});

describe("landscapePosterArtUrl", () => {
  it("adds a single landscape shape to a portrait poster query", () => {
    const url = landscapePosterArtUrl({
      publicBase: "https://polis.example",
      imdbId: "tt0111161",
      query: "rating=1&shape=poster",
      configId: "abc",
    });
    expect(url).toBe("https://polis.example/abc/poster/imdb/poster-default/tt0111161.jpg?rating=1&shape=landscape");
  });

  it("keeps one landscape shape and other params when the query already has one", () => {
    const url = landscapePosterArtUrl({
      publicBase: "https://polis.example",
      imdbId: "tt0111161",
      query: "shape=landscape&trend_rank=3",
      configId: "abc",
    });
    const query = new URL(url).searchParams;
    expect(url.startsWith("https://polis.example/abc/poster/imdb/poster-default/tt0111161.jpg?")).toBe(true);
    expect(query.getAll("shape")).toEqual(["landscape"]);
    expect(query.get("trend_rank")).toBe("3");
  });
});
