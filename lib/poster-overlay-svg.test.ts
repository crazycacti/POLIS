import { describe, expect, it } from "bun:test";
import sharp from "sharp";

import { prepareAgeMarkTile } from "@/lib/age-rating-marks";
import { svgFontFamilyAttr } from "@/lib/poster-overlay-font";

describe("poster overlay SVG", () => {
  it("uses single-quoted font-family without nested double quotes", () => {
    expect(svgFontFamilyAttr()).toContain("font-family='");
    expect(svgFontFamilyAttr()).toContain("Polis Overlay");
    expect(svgFontFamilyAttr()).not.toMatch(/font-family="[^"]*"/);
  });

  it("renders age mark SVG through sharp", async () => {
    const tile = await prepareAgeMarkTile("PG-13", 28);
    expect(tile.w).toBeGreaterThan(0);
    expect(tile.buf.byteLength).toBeGreaterThan(100);
  });

  it("renders overlay text SVG through sharp", async () => {
    const svg = `<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="80" height="30" rx="15" fill="#000000aa" />
  <text x="20" y="30" font-size="18" ${svgFontFamilyAttr()} font-weight="600" fill="#ffffff">Drama</text>
</svg>`;
    const out = await sharp(Buffer.from(svg)).png().toBuffer();
    expect(out.byteLength).toBeGreaterThan(100);
  });
});
