import { describe, expect, it } from "bun:test";

import {
  customBadgesFingerprint,
  customBadgesForTitle,
  decodeCustomBadgesParam,
  encodeCustomBadgesParam,
  MAX_CUSTOM_BADGES,
  parseCustomBadges,
  parseStoredCustomBadges,
} from "@/lib/custom-badges";

const valid = {
  text: "Family night",
  icon: "popcorn",
  corner: "top-left",
  color: "#FFFFFF",
  background: "#18181b",
  showOn: "movie",
  minRating: 7.25,
};

describe("custom badges", () => {
  it("accepts a valid badge and normalizes colors and rating", () => {
    expect(parseCustomBadges([valid])).toEqual([
      { ...valid, color: "#ffffff", minRating: 7.3 } as never,
    ]);
  });

  it("refuses the whole list when any badge is invalid", () => {
    expect(parseCustomBadges([valid, { ...valid, corner: "middle" }])).toBeNull();
    expect(parseCustomBadges([{ ...valid, icon: "skull" }])).toBeNull();
    expect(parseCustomBadges([{ ...valid, color: "red" }])).toBeNull();
    expect(parseCustomBadges([{ ...valid, minRating: 11 }])).toBeNull();
    expect(parseCustomBadges([{ ...valid, text: "", icon: null }])).toBeNull();
    expect(parseCustomBadges(Array.from({ length: MAX_CUSTOM_BADGES + 1 }, () => valid))).toBeNull();
    expect(parseCustomBadges("not a list")).toBeNull();
  });

  it("strips control characters and markup-looking text stays plain text, capped at 20 characters", () => {
    const [badge] = parseCustomBadges([{ ...valid, text: "<svg onload=x>\u0000‮this is far too long" }]) ?? [];
    expect(badge?.text).toBe("<svg onload=x> this");
    expect(Array.from(badge?.text ?? "").length).toBeLessThanOrEqual(20);
  });

  it("reads stored JSON safely and survives a broken row", () => {
    expect(parseStoredCustomBadges(JSON.stringify([valid]))).toHaveLength(1);
    expect(parseStoredCustomBadges("{broken")).toEqual([]);
    expect(parseStoredCustomBadges(null)).toEqual([]);
  });

  it("round-trips through the preview parameter and ignores tampered values", () => {
    const badges = parseCustomBadges([valid]) ?? [];
    expect(decodeCustomBadgesParam(encodeCustomBadgesParam(badges))).toEqual(badges);
    expect(decodeCustomBadgesParam("not-base64-json")).toEqual([]);
    expect(decodeCustomBadgesParam("x".repeat(5000))).toEqual([]);
  });

  it("gives different badge lists different cache fingerprints and none when empty", () => {
    const one = parseCustomBadges([valid]) ?? [];
    const two = parseCustomBadges([{ ...valid, text: "Date night" }]) ?? [];
    expect(customBadgesFingerprint([])).toBe("");
    expect(customBadgesFingerprint(one)).not.toBe(customBadgesFingerprint(two));
  });

  it("shows a badge only on the chosen type and above the chosen rating", () => {
    const badges = parseCustomBadges([valid]) ?? [];
    expect(customBadgesForTitle(badges, { stremioType: "movie", ratingValueTen: 8 })).toHaveLength(1);
    expect(customBadgesForTitle(badges, { stremioType: "series", ratingValueTen: 8 })).toHaveLength(0);
    expect(customBadgesForTitle(badges, { stremioType: "movie", ratingValueTen: 6 })).toHaveLength(0);
    expect(customBadgesForTitle(badges, { stremioType: "movie", ratingValueTen: null })).toHaveLength(0);
  });
});
