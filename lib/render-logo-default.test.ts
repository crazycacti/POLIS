import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { renderLogoPng } from "@/lib/render-logo-default";

const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let root = "";
let requests: { url: string; init: RequestInit | undefined }[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-logo-src-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  requests = [];
  const png = await sharp({ create: { width: 200, height: 80, channels: 4, background: "#fff" } }).png().toBuffer();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

describe("title logo download", () => {
  test("reads tmdb paths from the tmdb image cdn", async () => {
    expect(await renderLogoPng("/logo.png", "w500")).not.toBeNull();
    expect(requests.map((r) => r.url)).toEqual(["https://image.tmdb.org/t/p/w500/logo.png"]);
  });

  test("reads tvdb and fanart logo urls directly", async () => {
    expect(await renderLogoPng("https://artworks.thetvdb.com/banners/logo.png")).not.toBeNull();
    expect(await renderLogoPng("https://assets.fanart.tv/fanart/logo.png")).not.toBeNull();
    expect(requests.map((r) => r.url)).toEqual([
      "https://artworks.thetvdb.com/banners/logo.png",
      "https://assets.fanart.tv/fanart/logo.png",
    ]);
  });

  test("refuses logo urls outside the artwork hosts", async () => {
    expect(await renderLogoPng("https://example.com/logo.png")).toBeNull();
    expect(await renderLogoPng("http://assets.fanart.tv/fanart/logo.png")).toBeNull();
    expect(requests).toEqual([]);
  });

  test("downloads a tmdb logo once and keeps it out of the Next fetch cache", async () => {
    expect(await renderLogoPng("/cached-logo.png", "w500")).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await renderLogoPng("/cached-logo.png", "w500")).not.toBeNull();

    expect(requests.map((r) => r.url)).toEqual(["https://image.tmdb.org/t/p/w500/cached-logo.png"]);
    const nextOptions = (requests[0]?.init as { next?: { revalidate?: number } } | undefined)?.next;
    expect(nextOptions?.revalidate).toBe(0);
  });
});
