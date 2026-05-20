import { describe, expect, test } from "bun:test";

import { pickTmdbPosterPath } from "@/lib/artwork-poster";
import { pickFanartPosterUrl } from "@/lib/fanart-client";

describe("poster artwork selection", () => {
  test("default order prefers localized titled posters", () => {
    const path = pickTmdbPosterPath(
      [
        { file_path: "/textless.jpg", iso_639_1: "xx" },
        { file_path: "/en.jpg", iso_639_1: "en" },
      ],
      "en-US",
      false,
    );
    expect(path).toBe("/en.jpg");
  });

  test("title logo mode prefers textless posters", () => {
    const path = pickTmdbPosterPath(
      [
        { file_path: "/en.jpg", iso_639_1: "en" },
        { file_path: "/textless.jpg", iso_639_1: "xx" },
      ],
      "en-US",
      true,
    );
    expect(path).toBe("/textless.jpg");
  });

  test("fanart title logo mode prefers textless assets", () => {
    const url = pickFanartPosterUrl(
      [
        { url: "https://fanart/en.jpg", lang: "en" },
        { url: "https://fanart/textless.jpg", lang: "00" },
      ],
      "en-US",
      true,
    );
    expect(url).toBe("https://fanart/textless.jpg");
  });
});
