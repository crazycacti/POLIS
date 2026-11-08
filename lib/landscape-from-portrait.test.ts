import { describe, expect, it } from "bun:test";
import sharp from "sharp";

import { LANDSCAPE_HEIGHT, LANDSCAPE_WIDTH, landscapeFromPortrait } from "@/lib/landscape-artwork";

describe("landscapeFromPortrait", () => {
  it("fits art wider than 16:9 instead of failing", async () => {
    const wide = await sharp({ create: { width: 2400, height: 600, channels: 3, background: "#336699" } })
      .jpeg()
      .toBuffer();
    const out = await landscapeFromPortrait(wide);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(LANDSCAPE_WIDTH);
    expect(meta.height).toBe(LANDSCAPE_HEIGHT);
  });
});
