import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, utimes, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import sharp from "sharp";

import { trimPolisDiskNamespace } from "@/lib/polis-disk-cache";
import { POSTER_OVERLAY_DEFAULTS } from "@/lib/poster-query";
import { PREVIEW_CACHE_NAMESPACE } from "@/lib/preview-image-cache";
import { NO_PREVIEW_CALLER_KEYS, PREVIEW_KEYS_COOKIE, serializePreviewKeysCookie } from "@/lib/preview-keys";
import { previewPoster, resolvePreviewAuth } from "@/lib/preview-poster";
import { handlePreviewPosterRequest } from "@/lib/preview-poster-route";
import { PreviewRenderBudget } from "@/lib/preview-render-budget";

const KEY_A = "0123456789abcdef0123456789abcdef";
const KEY_B = "fedcba9876543210fedcba9876543210";
const OVERLAY_QUERY = "trend=0&logo=0";
const SERVER_KEY_ENV = ["TMDB_API_KEY", "TMDB_ACCESS_TOKEN", "MDBLIST_API_KEY", "FANART_API_KEY", "TVDB_API_KEY"];

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let upstream: URL[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-preview-poster-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  for (const name of SERVER_KEY_ENV) delete process.env[name];
  upstream = [];
  const jpeg = await sharp({ create: { width: 500, height: 750, channels: 3, background: "#456" } }).jpeg().toBuffer();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    upstream.push(url);
    const find = url.pathname.match(/^\/3\/find\/tt0(\d+)$/);
    if (find) return Response.json({ movie_results: [{ id: Number(find[1]) }], tv_results: [] });
    const details = url.pathname.match(/^\/3\/movie\/(\d+)$/);
    if (details) {
      const id = Number(details[1]);
      return Response.json({
        id,
        title: `Title ${id}`,
        poster_path: `/p${id}.jpg`,
        genres: [],
        images: { posters: [{ file_path: `/p${id}.jpg`, iso_639_1: "en" }], logos: [], backdrops: [] },
        external_ids: { imdb_id: `tt0${id}`, tvdb_id: null },
      });
    }
    if (url.hostname === "image.tmdb.org") {
      return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

function previewRequest(file: string, query: string, tmdbKey: string | null, headers: Record<string, string> = {}) {
  const cookie = tmdbKey
    ? `${PREVIEW_KEYS_COOKIE}=${encodeURIComponent(serializePreviewKeysCookie({ ...NO_PREVIEW_CALLER_KEYS, tmdb: tmdbKey }))}`
    : null;
  return new NextRequest(`http://polis.test/preview/poster/${file}?${query}`, {
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
  });
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

describe("preview poster route", () => {
  test("rejects bad ids, unknown widths and keys in the query", async () => {
    expect((await handlePreviewPosterRequest(previewRequest("nope.webp", OVERLAY_QUERY, KEY_A), "nope.webp")).status).toBe(400);
    expect(
      (await handlePreviewPosterRequest(previewRequest("tt0661.webp", `${OVERLAY_QUERY}&w=200`, KEY_A), "tt0661.webp")).status,
    ).toBe(400);
    expect(
      (await handlePreviewPosterRequest(previewRequest("tt0661.webp", `${OVERLAY_QUERY}&api_key=${KEY_A}`, null), "tt0661.webp"))
        .status,
    ).toBe(400);
    expect(upstream).toHaveLength(0);
  });

  test("a render made with one key serves callers with other keys and callers without keys", async () => {
    const first = await handlePreviewPosterRequest(previewRequest("tt0661.webp", OVERLAY_QUERY, KEY_A), "tt0661.webp");
    expect(first.status).toBe(200);
    const callsAfterFirst = upstream.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const otherKey = await handlePreviewPosterRequest(previewRequest("tt0661.webp", OVERLAY_QUERY, KEY_B), "tt0661.webp");
    expect(otherKey.status).toBe(200);
    const keyless = await handlePreviewPosterRequest(previewRequest("tt0661.webp", OVERLAY_QUERY, null), "tt0661.webp");
    expect(keyless.status).toBe(200);
    expect(upstream.length).toBe(callsAfterFirst);
    expect(keyless.headers.get("cache-control")).toContain("private");
  });

  test("a caller without keys never renders and gets 404 for uncached titles", async () => {
    const response = await handlePreviewPosterRequest(previewRequest("tt0662.webp", OVERLAY_QUERY, null), "tt0662.webp");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(upstream).toHaveLength(0);
  });

  test("keys never reach cache file names, file contents or response headers", async () => {
    const response = await handlePreviewPosterRequest(previewRequest("tt0663.webp", `${OVERLAY_QUERY}&w=160`, KEY_A), "tt0663.webp");
    expect(response.status).toBe(200);
    for (const [, value] of response.headers) expect(value).not.toContain(KEY_A);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const files = await listFiles(path.join(root, PREVIEW_CACHE_NAMESPACE));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      expect(file).not.toContain(KEY_A);
      expect(Buffer.from(await Bun.file(file).arrayBuffer()).includes(KEY_A)).toBe(false);
    }
  });

  test("thumbnails are webp at the requested width and revalidate with an ETag", async () => {
    const response = await handlePreviewPosterRequest(previewRequest("tt0664.webp", `${OVERLAY_QUERY}&w=160`, KEY_A), "tt0664.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(160);
    const etag = response.headers.get("etag");
    expect(etag).toBeTruthy();

    const revalidated = await handlePreviewPosterRequest(
      previewRequest("tt0664.webp", `${OVERLAY_QUERY}&w=160`, KEY_B, { "if-none-match": etag! }),
      "tt0664.webp",
    );
    expect(revalidated.status).toBe(304);
  });
});

describe("preview render budget", () => {
  test("stops uncached renders past the per-minute cap but keeps serving cached ones", async () => {
    const budget = new PreviewRenderBudget({ server: () => 1, caller: () => 1 });
    const auth = resolvePreviewAuth({ ...NO_PREVIEW_CALLER_KEYS, tmdb: KEY_A });
    const overlay = { ...POSTER_OVERLAY_DEFAULTS, trendTags: false, logoOnPoster: false };
    const base = { overlay, width: null, auth, language: "en-US", budget };

    expect((await previewPoster({ ...base, imdbId: "tt0665" })).kind).toBe("image");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const limited = await previewPoster({ ...base, imdbId: "tt0666" });
    expect(limited.kind).toBe("limited");
    expect(limited.kind === "limited" && limited.retryAfterSec).toBeGreaterThan(0);
    expect((await previewPoster({ ...base, imdbId: "tt0665" })).kind).toBe("image");
  });

  test("renders that fall back to a server key count against the server cap", () => {
    process.env.MDBLIST_API_KEY = "server-mdblist";
    expect(resolvePreviewAuth({ ...NO_PREVIEW_CALLER_KEYS, tmdb: KEY_A }).keySource).toBe("server");
    expect(resolvePreviewAuth({ ...NO_PREVIEW_CALLER_KEYS, tmdb: KEY_A, mdblist: "caller-mdblist" }).keySource).toBe("caller");
  });

  test("the window frees slots after a minute", () => {
    const budget = new PreviewRenderBudget({ server: () => 2, caller: () => 2 });
    expect(budget.take("caller", 0)).toBe(true);
    expect(budget.take("caller", 1)).toBe(true);
    expect(budget.take("caller", 2)).toBe(false);
    expect(budget.take("server", 2)).toBe(true);
    expect(budget.take("caller", 60_001)).toBe(true);
  });
});

describe("preview cache size", () => {
  test("trimming keeps the newest files up to the cap", async () => {
    const dir = path.join(root, PREVIEW_CACHE_NAMESPACE, "titles");
    await mkdir(dir, { recursive: true });
    for (let index = 0; index < 5; index += 1) {
      const file = path.join(dir, `f${index}.webp`);
      await writeFile(file, "x");
      await utimes(file, index + 1, index + 1);
    }
    expect((await trimPolisDiskNamespace(PREVIEW_CACHE_NAMESPACE, 2)).removed).toBe(3);
    expect((await readdir(dir)).sort()).toEqual(["f3.webp", "f4.webp"]);
  });
});
