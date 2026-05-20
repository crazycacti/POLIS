import { describe, expect, test } from "bun:test";

import {
  episodeThumbnailUrl,
  metahubEpisodeThumbnailUrl,
  tmdbStillThumbnailUrl,
} from "@/lib/episode-thumbnail";

describe("episodeThumbnailUrl", () => {
  test("prefers TMDB still_path", () => {
    expect(
      episodeThumbnailUrl({
        imdbId: "tt0944947",
        season: 1,
        episode: 1,
        stillPath: "/abc.jpg",
      }),
    ).toBe(tmdbStillThumbnailUrl("/abc.jpg"));
  });

  test("falls back to metahub", () => {
    expect(
      episodeThumbnailUrl({
        imdbId: "tt0944947",
        season: 1,
        episode: 1,
        stillPath: null,
      }),
    ).toBe(metahubEpisodeThumbnailUrl("tt0944947", 1, 1));
  });
});
