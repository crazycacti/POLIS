import { describe, expect, it } from "bun:test";

import { aiometadataArtPatterns } from "@/lib/polis-urls";

describe("aiometadataArtPatterns", () => {
  it("always includes AIO key placeholders for AIOMetadata API list substitution", () => {
    const patterns = aiometadataArtPatterns(
      "https://polis.example",
      "artwork=tmdb&rating=1",
    );
    expect(patterns.posterPattern).toBe(
      "https://polis.example/poster/imdb/poster-default/{imdb_id}.jpg?artwork=tmdb&rating=1&tmdb_key={tmdb_key}&mdblist_key={mdblist_key}",
    );
  });

  it("includes key placeholders even when overlay query is empty", () => {
    const patterns = aiometadataArtPatterns("https://polis.example", "");
    expect(patterns.posterPattern).toBe(
      "https://polis.example/poster/imdb/poster-default/{imdb_id}.jpg?tmdb_key={tmdb_key}&mdblist_key={mdblist_key}",
    );
  });
});
