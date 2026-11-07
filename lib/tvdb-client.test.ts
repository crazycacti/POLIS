import { describe, expect, test } from "bun:test";

import { pickTvdbPoster, rankTvdbLogos, tvdbArtworkRecords, tvdbLanguageCode } from "@/lib/tvdb-client";

describe("tvdb artworks", () => {
  test("reads the documented series-extended shape and a bare array", () => {
    const rows = [{ image: "https://artworks.thetvdb.com/a.jpg", type: 2 }];
    expect(tvdbArtworkRecords({ data: { artworks: rows } })).toEqual(rows);
    expect(tvdbArtworkRecords({ data: rows })).toEqual(rows);
    expect(tvdbArtworkRecords({ data: null })).toEqual([]);
    expect(tvdbArtworkRecords(null)).toEqual([]);
  });

  test("maps ISO 639-1 to the 639-2 codes TVDB uses", () => {
    expect(tvdbLanguageCode("en-US")).toBe("eng");
    expect(tvdbLanguageCode("de")).toBe("deu");
    expect(tvdbLanguageCode("eng")).toBe("eng");
    expect(tvdbLanguageCode("xx")).toBeNull();
  });

  test("prefers the requested language and reports textless art", () => {
    const records = [
      { image: "https://artworks.thetvdb.com/rus.jpg", type: 2, score: 900, language: "rus" },
      { image: "https://artworks.thetvdb.com/eng.jpg", type: 2, score: 10, language: "eng" },
      { image: "https://artworks.thetvdb.com/none.jpg", type: 2, score: 1, includesText: false },
      { image: "https://artworks.thetvdb.com/banner.jpg", type: 1, score: 5000, language: "eng" },
    ];
    expect(pickTvdbPoster(records, "en-US")).toEqual({
      url: "https://artworks.thetvdb.com/eng.jpg",
      textless: false,
    });
    expect(pickTvdbPoster(records, "en-US", true)).toEqual({
      url: "https://artworks.thetvdb.com/none.jpg",
      textless: true,
    });
  });

  test("ranks clearlogos by user language, then english, then no language", () => {
    const records = [
      { image: "https://artworks.thetvdb.com/rus.png", type: 23, score: 900, language: "rus" },
      { image: "https://artworks.thetvdb.com/none.png", type: 23, score: 800, language: null },
      { image: "https://artworks.thetvdb.com/eng.png", type: 23, score: 10, language: "eng" },
      { image: "https://artworks.thetvdb.com/deu.png", type: 23, score: 1, language: "deu" },
      { image: "https://artworks.thetvdb.com/poster.jpg", type: 2, score: 5000, language: "deu" },
    ];
    expect(rankTvdbLogos(records, "de-DE")).toEqual([
      "https://artworks.thetvdb.com/deu.png",
      "https://artworks.thetvdb.com/eng.png",
      "https://artworks.thetvdb.com/none.png",
    ]);
    expect(rankTvdbLogos(records, "en-US")).toEqual([
      "https://artworks.thetvdb.com/eng.png",
      "https://artworks.thetvdb.com/none.png",
    ]);
  });
});
