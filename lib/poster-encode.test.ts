import { afterEach, describe, expect, it } from "bun:test";

import { encodePosterImage } from "@/lib/poster-encode";

const priorFormat = process.env.POLIS_POSTER_FORMAT;

afterEach(() => {
  if (priorFormat === undefined) delete process.env.POLIS_POSTER_FORMAT;
  else process.env.POLIS_POSTER_FORMAT = priorFormat;
});

describe("encodePosterImage", () => {
  it("returns webp bytes by default", async () => {
    delete process.env.POLIS_POSTER_FORMAT;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const out = await encodePosterImage(png);
    expect(out.subarray(0, 4).toString()).toBe("RIFF");
    expect(out.subarray(8, 12).toString()).toBe("WEBP");
  });
});
