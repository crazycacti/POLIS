import { describe, expect, it } from "bun:test";

import { fitBadgeRow } from "@/lib/render-poster-soft";
import { parsePosterOverlayQuery, POSTER_OVERLAY_DEFAULTS, serializePosterQuery } from "@/lib/poster-query";
import { buildRatingBadges, parseRatingBadgeSources, ratingBadgeText } from "@/lib/ratings";

describe("rating badges", () => {
  it("shows each source on its own scale", () => {
    expect(ratingBadgeText("imdb", 8.43)).toBe("IMDb 8.4");
    expect(ratingBadgeText("tomatoes", 9.2)).toBe("RT 92%");
    expect(ratingBadgeText("metacritic", 7.8)).toBe("MC 78");
    expect(ratingBadgeText("letterboxd", 7.8)).toBe("LB 3.9");
  });

  it("keeps up to six known sources once each, in order", () => {
    expect(parseRatingBadgeSources("IMDb,tomatoes,imdb,bogus,letterboxd,trakt,tmdb,mdblist,metacritic")).toEqual([
      "imdb",
      "tomatoes",
      "letterboxd",
      "trakt",
      "tmdb",
      "mdblist",
    ]);
    expect(parseRatingBadgeSources("average")).toEqual([]);
  });

  it("skips sources with no score", () => {
    expect(buildRatingBadges(["imdb", "tomatoes"], { tomatoes: 9 })).toEqual([
      { source: "tomatoes", text: "RT 90%", value: "90%" },
    ]);
    expect(buildRatingBadges(["tomatoesaudience"], { tomatoesaudience: 8.1 })[0]?.value).toBe("81%");
  });

  it("fills a missing score with the next site in order and shows at most three", () => {
    const sources = parseRatingBadgeSources("imdb,metacritic,tomatoes,letterboxd,trakt");
    const scores = { imdb: 8.4, tomatoes: 9.2, letterboxd: 7.8, trakt: 8 };
    expect(buildRatingBadges(sources, scores).map((b) => b.source)).toEqual(["imdb", "tomatoes", "letterboxd"]);
  });

  it("keeps the logo style only when badges are on", () => {
    const withLogos = serializePosterQuery({ ...POSTER_OVERLAY_DEFAULTS, ratingBadges: "imdb", ratingBadgeStyle: "logo" });
    expect(parsePosterOverlayQuery(new URLSearchParams(withLogos)).ratingBadgeStyle).toBe("logo");
    expect(serializePosterQuery({ ...POSTER_OVERLAY_DEFAULTS, ratingBadgeStyle: "logo" })).not.toContain("rating_badge_style");
  });

  it("stays out of the default poster query and round-trips when set", () => {
    expect(serializePosterQuery(POSTER_OVERLAY_DEFAULTS)).not.toContain("rating_badges");
    const query = serializePosterQuery({ ...POSTER_OVERLAY_DEFAULTS, ratingBadges: "imdb,tomatoes" });
    expect(parsePosterOverlayQuery(new URLSearchParams(query)).ratingBadges).toBe("imdb,tomatoes");
  });

  it("drops badges from the end when the row is too wide", () => {
    const capsule = (text: string, width: number) => ({ text, width });
    expect(fitBadgeRow([capsule("a", 100), capsule("b", 100), capsule("c", 100)], 10, 215).map((c) => c.text)).toEqual(["a", "b"]);
    expect(fitBadgeRow([capsule("a", 500)], 10, 100).map((c) => c.text)).toEqual(["a"]);
  });
});

describe("rating logos", () => {
  it("ships no IMDb or Rotten Tomatoes logo, so those badges stay text", async () => {
    const { loadRatingLogo } = await import("@/lib/rating-logos");
    expect(await loadRatingLogo("imdb", 20)).toBeNull();
    expect(await loadRatingLogo("tomatoes", 20)).toBeNull();
    expect(await loadRatingLogo("tomatoesaudience", 20)).toBeNull();
    expect(await loadRatingLogo("letterboxd", 20)).not.toBeNull();
  });
});
