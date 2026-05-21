import { describe, expect, test } from "bun:test";

import {
  FOOTER_PAD_Y_MAX,
  parsePosterOverlayQuery,
  POSTER_OVERLAY_DEFAULTS,
  resolveFooterPadBottom,
} from "@/lib/poster-query";

describe("resolveFooterPadBottom", () => {
  const h = 750;
  const floor = Math.round(h * 0.022);

  test("uses genre pad when only genre is enabled", () => {
    const overlay = {
      ...POSTER_OVERLAY_DEFAULTS,
      genre: true,
      rating: false,
      padY: 40,
      ratingPadY: 16,
    };
    expect(resolveFooterPadBottom(overlay, h)).toBe(40);
  });

  test("uses rating pad when only rating is enabled", () => {
    const overlay = {
      ...POSTER_OVERLAY_DEFAULTS,
      genre: false,
      rating: true,
      padY: 16,
      ratingPadY: 52,
    };
    expect(resolveFooterPadBottom(overlay, h)).toBe(52);
  });

  test("uses max of both pads when genre and rating are enabled", () => {
    const overlay = {
      ...POSTER_OVERLAY_DEFAULTS,
      genre: true,
      rating: true,
      padY: 30,
      ratingPadY: 55,
    };
    expect(resolveFooterPadBottom(overlay, h)).toBe(55);
  });

  test("applies canvas floor when pads are below minimum inset", () => {
    const overlay = {
      ...POSTER_OVERLAY_DEFAULTS,
      genre: true,
      rating: false,
      padY: 10,
      ratingPadY: 10,
    };
    expect(resolveFooterPadBottom(overlay, h)).toBe(floor);
  });

  test("returns floor when neither footer line is enabled", () => {
    const overlay = {
      ...POSTER_OVERLAY_DEFAULTS,
      genre: false,
      rating: false,
    };
    expect(resolveFooterPadBottom(overlay, h)).toBe(floor);
  });
});

describe("parsePosterOverlayQuery footer inset clamp", () => {
  test("clamps pad_y and rating_pad_y to FOOTER_PAD_Y_MAX", () => {
    const q = parsePosterOverlayQuery(
      new URLSearchParams("pad_y=200&rating_pad_y=999"),
    );
    expect(q.padY).toBe(FOOTER_PAD_Y_MAX);
    expect(q.ratingPadY).toBe(FOOTER_PAD_Y_MAX);
  });
});
