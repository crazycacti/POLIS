import { describe, expect, test } from "bun:test";

import { pickTmdbPosterPath, postersHasXxTextless } from "@/lib/artwork-poster";
import { pickFanartPoster } from "@/lib/fanart-client";

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

  test("title logo mode prefers xx textless over null iso", () => {
    const path = pickTmdbPosterPath(
      [
        { file_path: "/en.jpg", iso_639_1: "en" },
        { file_path: "/neutral.jpg", iso_639_1: null },
        { file_path: "/textless.jpg", iso_639_1: "xx" },
      ],
      "en-US",
      true,
    );
    expect(path).toBe("/textless.jpg");
  });

  test("postersHasXxTextless is true only for xx iso", () => {
    expect(
      postersHasXxTextless([
        { file_path: "/neutral.jpg", iso_639_1: null },
        { file_path: "/textless.jpg", iso_639_1: "xx" },
      ]),
    ).toBe(true);
    expect(postersHasXxTextless([{ file_path: "/neutral.jpg", iso_639_1: null }])).toBe(false);
  });

  test("title logo mode falls back to a no-language poster when no xx textless", () => {
    const path = pickTmdbPosterPath(
      [
        { file_path: "/en.jpg", iso_639_1: "en" },
        { file_path: "/neutral.jpg", iso_639_1: null },
      ],
      "en-US",
      true,
    );
    expect(path).toBe("/neutral.jpg");
  });

  test("title logo mode uses titled poster when nothing is textless", () => {
    const path = pickTmdbPosterPath(
      [
        { file_path: "/en.jpg", iso_639_1: "en" },
        { file_path: "/fr.jpg", iso_639_1: "fr" },
      ],
      "en-US",
      true,
    );
    expect(path).toBe("/en.jpg");
  });

  test("fanart title logo mode prefers textless assets", () => {
    const poster = pickFanartPoster(
      [
        { url: "https://fanart/en.jpg", lang: "en" },
        { url: "https://fanart/textless.jpg", lang: "00" },
      ],
      "en-US",
      true,
    );
    expect(poster).toEqual({ url: "https://fanart/textless.jpg", textless: true });
  });

  test("fanart reports titled art when no textless asset exists", () => {
    const poster = pickFanartPoster([{ url: "https://fanart/en.jpg", lang: "en" }], "en-US", true);
    expect(poster).toEqual({ url: "https://fanart/en.jpg", textless: false });
  });
});
