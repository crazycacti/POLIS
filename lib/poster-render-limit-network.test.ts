import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { POSTER_OVERLAY_DEFAULTS } from "@/lib/poster-query";
import { renderPosterForImdbCached } from "@/lib/poster-render-cache";

const SLOW_TMDB_ID = 660301;
const FAST_TMDB_ID = 660302;
const FAST_RENDER_DEADLINE_MS = 3_000;

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let releaseSlowArt: () => void = () => {};
let slowArtRequested: () => void = () => {};
let slowArtSeen: Promise<void> = Promise.resolve();

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-render-limit-"));
  process.env.POLIS_CACHE_DIR = root;
  process.env.POLIS_RENDER_MAX_CONCURRENT = "1";
  delete process.env.POLIS_CACHE_DISABLE;
  const slowArt = new Promise<void>((resolve) => (releaseSlowArt = resolve));
  slowArtSeen = new Promise<void>((resolve) => (slowArtRequested = resolve));
  const jpeg = await sharp({ create: { width: 60, height: 90, channels: 3, background: "#567" } }).jpeg().toBuffer();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
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
      if (url.pathname.endsWith(`/p${SLOW_TMDB_ID}.jpg`)) {
        slowArtRequested();
        await slowArt;
      }
      return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

afterEach(async () => {
  releaseSlowArt();
  await new Promise((resolve) => setTimeout(resolve, 20));
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

function render(tmdbId: number) {
  return renderPosterForImdbCached({
    imdbId: `tt0${tmdbId}`,
    overlay: { ...POSTER_OVERLAY_DEFAULTS, trendTags: false, logoOnPoster: false },
    credential: { kind: "api_key", key: "render-limit-tmdb" },
    language: "en-US",
    mdblistApiKey: null,
    fanartApiKey: null,
    tvdbCredentials: null,
    configId: null,
  });
}

describe("render slots", () => {
  test("a render waiting on a slow artwork download does not hold the only render slot", async () => {
    const slow = render(SLOW_TMDB_ID);
    await slowArtSeen;

    const fast = await Promise.race([
      render(FAST_TMDB_ID),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), FAST_RENDER_DEADLINE_MS)),
    ]);
    expect(fast).not.toBe("blocked");
    expect(fast === "blocked" ? null : fast?.source).toBe("buffer");

    releaseSlowArt();
    expect((await slow)?.source).toBe("buffer");
  });
});
