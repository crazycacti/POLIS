import { describe, expect, test } from "bun:test";

import { measureFooterPill } from "@/lib/poster-footer-pill";
import {
  computePosterLogoPlacement,
  LOGO_ABOVE_FOOTER_GAP_PX,
  posterFooterBandTop,
  posterLogoAboveFooterGap,
  posterLogoMaxWidth,
  resolvePosterLogoFooterBandTop,
} from "@/lib/poster-logo-on-poster";

describe("poster title logo layout", () => {
  test("posterLogoMaxWidth caps at 800 and scales with canvas", () => {
    expect(posterLogoMaxWidth(500)).toBe(420);
    expect(posterLogoMaxWidth(1000)).toBe(800);
  });

  test("logo sits above footer band when footer is reserved", () => {
    const w = 500;
    const h = 750;
    const padBottom = 20;
    const footerH = 48;
    const bandTop = posterFooterBandTop(h, padBottom, footerH);
    const gap = 14;
    const placement = computePosterLogoPlacement({
      canvasW: w,
      canvasH: h,
      logoW: 600,
      logoH: 120,
      footerBandTop: bandTop,
      padBottom,
      padX: 24,
      gap,
      gridCell: 7,
    });

    expect(placement.left).toBeGreaterThanOrEqual(0);
    expect(placement.left + placement.width).toBeLessThanOrEqual(w);
    expect(placement.top + placement.height).toBeLessThanOrEqual(bandTop - gap + 1);
    expect(placement.width).toBeLessThanOrEqual(posterLogoMaxWidth(w));
  });

  test("reserves footer band for rating-only row using rating inset", () => {
    const h = 750;
    const padBottom = 48;
    const fs = 38;
    const ratingMetrics = measureFooterPill("★ 8.2", fs);
    const bandTop = resolvePosterLogoFooterBandTop({
      canvasH: h,
      footerPadBottom: padBottom,
      genreEnabled: false,
      ratingEnabled: true,
      genreMetrics: null,
      ratingMetrics,
      genreFooterFs: fs,
      ratingFooterFs: fs,
    });
    expect(bandTop).toBe(posterFooterBandTop(h, padBottom, ratingMetrics.boxH));
  });

  test("reserves footer band when genre or rating toggle is on", () => {
    const h = 750;
    const padBottom = 20;
    const fs = 38;
    const genreMetrics = measureFooterPill("Action", fs);
    const ratingMetrics = measureFooterPill("★ 8.2", fs);
    const bandTop = resolvePosterLogoFooterBandTop({
      canvasH: h,
      footerPadBottom: padBottom,
      genreEnabled: true,
      ratingEnabled: true,
      genreMetrics,
      ratingMetrics,
      genreFooterFs: fs,
      ratingFooterFs: fs,
    });
    const footerMaxBoxH = Math.max(genreMetrics.boxH, ratingMetrics.boxH);
    expect(bandTop).toBe(posterFooterBandTop(h, padBottom, footerMaxBoxH));
  });

  test("logo bottom clears footer band with scaled gap", () => {
    const h = 750;
    const padBottom = 20;
    const fs = 38;
    const gap = posterLogoAboveFooterGap(h);
    expect(gap).toBe(10);
    expect(gap).toBeLessThanOrEqual(14);
    const genreMetrics = measureFooterPill("Drama", fs);
    const bandTop = resolvePosterLogoFooterBandTop({
      canvasH: h,
      footerPadBottom: padBottom,
      genreEnabled: true,
      ratingEnabled: false,
      genreMetrics,
      ratingMetrics: null,
      genreFooterFs: fs,
      ratingFooterFs: fs,
    })!;
    const placement = computePosterLogoPlacement({
      canvasW: 500,
      canvasH: h,
      logoW: 400,
      logoH: 60,
      footerBandTop: bandTop,
      padBottom,
      padX: 24,
      gap,
      gridCell: 7,
    });
    expect(placement.top + placement.height).toBe(bandTop - gap);
  });

  test("logo moves up when footer inset increases", () => {
    const h = 750;
    const w = 500;
    const fs = 38;
    const gap = posterLogoAboveFooterGap(h);
    const genreMetrics = measureFooterPill("Drama", fs);
    const lowPad = 20;
    const highPad = 60;
    const lowBand = resolvePosterLogoFooterBandTop({
      canvasH: h,
      footerPadBottom: lowPad,
      genreEnabled: true,
      ratingEnabled: false,
      genreMetrics,
      ratingMetrics: null,
      genreFooterFs: fs,
      ratingFooterFs: fs,
    })!;
    const highBand = resolvePosterLogoFooterBandTop({
      canvasH: h,
      footerPadBottom: highPad,
      genreEnabled: true,
      ratingEnabled: false,
      genreMetrics,
      ratingMetrics: null,
      genreFooterFs: fs,
      ratingFooterFs: fs,
    })!;
    const logoH = 60;
    const lowTop = computePosterLogoPlacement({
      canvasW: w,
      canvasH: h,
      logoW: 400,
      logoH,
      footerBandTop: lowBand,
      padBottom: lowPad,
      padX: 24,
      gap,
      gridCell: 7,
    }).top;
    const highTop = computePosterLogoPlacement({
      canvasW: w,
      canvasH: h,
      logoW: 400,
      logoH,
      footerBandTop: highBand,
      padBottom: highPad,
      padX: 24,
      gap,
      gridCell: 7,
    }).top;
    expect(highTop).toBeLessThan(lowTop);
  });

  test("logo uses bottom inset when no footer band", () => {
    const h = 750;
    const padBottom = 24;
    const placement = computePosterLogoPlacement({
      canvasW: 500,
      canvasH: h,
      logoW: 400,
      logoH: 80,
      footerBandTop: null,
      padBottom,
      padX: 24,
      gap: 14,
      gridCell: 7,
    });

    expect(placement.top + placement.height).toBe(h - padBottom);
  });
});
