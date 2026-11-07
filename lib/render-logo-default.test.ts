import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import sharp from "sharp";

import { renderLogoPng } from "@/lib/render-logo-default";

const realFetch = globalThis.fetch;
let requests: string[] = [];

beforeEach(async () => {
  requests = [];
  const png = await sharp({
    create: { width: 40, height: 20, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).png().toBuffer();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(input instanceof Request ? input.url : String(input));
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("title logo download", () => {
  test("reads tmdb paths from the tmdb image cdn", async () => {
    expect(await renderLogoPng("/logo.png", "w500")).not.toBeNull();
    expect(requests).toEqual(["https://image.tmdb.org/t/p/w500/logo.png"]);
  });

  test("reads tvdb and fanart logo urls directly", async () => {
    expect(await renderLogoPng("https://artworks.thetvdb.com/banners/logo.png")).not.toBeNull();
    expect(await renderLogoPng("https://assets.fanart.tv/fanart/logo.png")).not.toBeNull();
    expect(requests).toEqual([
      "https://artworks.thetvdb.com/banners/logo.png",
      "https://assets.fanart.tv/fanart/logo.png",
    ]);
  });

  test("refuses logo urls outside the artwork hosts", async () => {
    expect(await renderLogoPng("https://example.com/logo.png")).toBeNull();
    expect(await renderLogoPng("http://assets.fanart.tv/fanart/logo.png")).toBeNull();
    expect(requests).toEqual([]);
  });
});
