import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { renderBackdropJpegCached, resolveCachedBackdropDiskPath } from "@/lib/artwork-render-cache";

const DAY_MS = 24 * 60 * 60 * 1000;
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let root = "";

async function solidJpeg(red: number): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 36, channels: 3, background: { r: red, g: 0, b: 0 } } })
    .jpeg()
    .toBuffer();
}

function serveImage(bytes: Buffer): void {
  globalThis.fetch = (async () =>
    new Response(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
}

async function cachedFile(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const file = await resolveCachedBackdropDiskPath("tt0000001", "en-US", null);
    if (file) return file;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("backdrop was never written to the disk cache");
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-artwork-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  delete process.env.POLIS_CACHE_ARTWORK_TTL_SEC;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

describe("cached backdrops", () => {
  test("serve the cached file within a week and fetch the art again after it", async () => {
    serveImage(await solidJpeg(200));
    const first = await renderBackdropJpegCached("/a.jpg", "tt0000001", "en-US", null);
    expect(first).not.toBeNull();
    const file = await cachedFile();

    serveImage(await solidJpeg(20));
    expect((await renderBackdropJpegCached("/a.jpg", "tt0000001", "en-US", null))?.equals(first!)).toBe(true);

    const eightDaysAgo = new Date(Date.now() - 8 * DAY_MS);
    await utimes(file, eightDaysAgo, eightDaysAgo);

    const refreshed = await renderBackdropJpegCached("/a.jpg", "tt0000001", "en-US", null);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.equals(first!)).toBe(false);
  });
});
