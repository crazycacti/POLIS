import { describe, expect, test } from "bun:test";

import {
  FOOTER_PAD_Y_MAX,
  parsePosterOverlayQuery,
  POSTER_OVERLAY_DEFAULTS,
  resolveFooterPadBottom,
  serializePosterQuery,
  syncFooterPadsWhenBothEnabled,
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

describe("syncFooterPadsWhenBothEnabled", () => {
  test("aligns pad_y and rating_pad_y to max when both footer lines are on", () => {
    const overlay = {
      ...POSTER_OVERLAY_DEFAULTS,
      genre: true,
      rating: true,
      padY: 16,
      ratingPadY: 72,
    };
    const synced = syncFooterPadsWhenBothEnabled(overlay);
    expect(synced.padY).toBe(72);
    expect(synced.ratingPadY).toBe(72);
  });

  test("leaves pads unchanged when only one footer line is on", () => {
    const overlay = {
      ...POSTER_OVERLAY_DEFAULTS,
      genre: true,
      rating: false,
      padY: 16,
      ratingPadY: 72,
    };
    const synced = syncFooterPadsWhenBothEnabled(overlay);
    expect(synced.padY).toBe(16);
    expect(synced.ratingPadY).toBe(72);
  });

  test("parse and serialize normalize mismatched footer insets", () => {
    const parsed = parsePosterOverlayQuery(
      new URLSearchParams("genre=1&rating=1&pad_y=20&rating_pad_y=55"),
    );
    expect(parsed.padY).toBe(55);
    expect(parsed.ratingPadY).toBe(55);
    const qs = serializePosterQuery({
      ...POSTER_OVERLAY_DEFAULTS,
      genre: true,
      rating: true,
      padY: 20,
      ratingPadY: 55,
    });
    expect(qs).toContain("pad_y=55");
    expect(qs).toContain("rating_pad_y=55");
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

describe("genre default", () => {
  test("is off when the url leaves it out and kept when a saved url sets it", () => {
    expect(parsePosterOverlayQuery(new URLSearchParams()).genre).toBe(false);
    expect(parsePosterOverlayQuery(new URLSearchParams("genre=1")).genre).toBe(true);
  });
});

describe("numeric style params", () => {
  test("empty values fall back to defaults", () => {
    const parsed = parsePosterOverlayQuery(
      new URLSearchParams("pad_x=&pad_y=&rating_font=&line_gap=&trend_rank="),
    );
    expect(parsed.padX).toBe(POSTER_OVERLAY_DEFAULTS.padX);
    expect(parsed.padY).toBe(POSTER_OVERLAY_DEFAULTS.padY);
    expect(parsed.ratingFontSize).toBe(POSTER_OVERLAY_DEFAULTS.ratingFontSize);
    expect(parsed.lineGap).toBe(POSTER_OVERLAY_DEFAULTS.lineGap);
    expect(parsed.trendRank).toBeNull();
  });

  test("fractional values round to the same integer and round-trip", () => {
    const a = parsePosterOverlayQuery(new URLSearchParams("pad_x=30.0001&rating_font=40.4"));
    const b = parsePosterOverlayQuery(new URLSearchParams("pad_x=30.0002&rating_font=39.6"));
    expect(a.padX).toBe(30);
    expect(a.ratingFontSize).toBe(40);
    expect(serializePosterQuery(a)).toBe(serializePosterQuery(b));
    const reparsed = parsePosterOverlayQuery(new URLSearchParams(serializePosterQuery(a)));
    expect(serializePosterQuery(reparsed)).toBe(serializePosterQuery(a));
  });
});

describe("layout param", () => {
  test("falls back to the default layout when missing or unknown", () => {
    expect(parsePosterOverlayQuery(new URLSearchParams()).layout).toBe(
      POSTER_OVERLAY_DEFAULTS.layout,
    );
    expect(parsePosterOverlayQuery(new URLSearchParams("layout=grid")).layout).toBe(
      POSTER_OVERLAY_DEFAULTS.layout,
    );
    expect(parsePosterOverlayQuery(new URLSearchParams("layout=stack")).layout).toBe("stack");
  });
});
