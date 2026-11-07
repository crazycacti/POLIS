import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { POSTER_OVERLAY_DEFAULTS } from "@/lib/poster-query";
import { DEGRADED_POSTER_TTL_SEC, renderPosterForImdbCached } from "@/lib/poster-render-cache";

const IMDB_ID = "tt0990101";
const TMDB_ID = 990101;
const SETTLE_MS = 50;

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let detailsCalls = 0;
let mdblistCalls = 0;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-degraded-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  detailsCalls = 0;
  mdblistCalls = 0;
  const jpeg = await sharp({ create: { width: 50, height: 75, channels: 3, background: "#456" } }).jpeg().toBuffer();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.mdblist.com") {
      mdblistCalls += 1;
      return Response.json({ error: "Daily API limit reached" }, { status: 429 });
    }
    if (url.pathname.startsWith("/3/find/")) {
      return Response.json({ movie_results: [{ id: TMDB_ID }], tv_results: [] });
    }
    if (url.pathname.startsWith("/3/trending/")) return Response.json({ results: [] });
    if (url.pathname === `/3/movie/${TMDB_ID}`) {
      detailsCalls += 1;
      return Response.json({
        id: TMDB_ID,
        title: "Degraded Render",
        poster_path: "/p.jpg",
        vote_average: 7.1,
        vote_count: 10,
        genres: [],
        images: { posters: [{ file_path: "/p.jpg", iso_639_1: "en" }], logos: [], backdrops: [] },
        external_ids: { imdb_id: IMDB_ID, tvdb_id: null },
      });
    }
    if (url.hostname === "image.tmdb.org") {
      return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

function render() {
  return renderPosterForImdbCached({
    imdbId: IMDB_ID,
    overlay: { ...POSTER_OVERLAY_DEFAULTS, trendTags: false, logoOnPoster: false },
    credential: { kind: "api_key", key: "degraded-render-tmdb" },
    language: "en-US",
    mdblistApiKey: "degraded-render-mdblist",
    fanartApiKey: null,
    tvdbCredentials: null,
    configId: null,
  });
}

describe("poster render while MDBList is unavailable", () => {
  test("serves the degraded render from a short-lived cache on repeat views", async () => {
    const first = await render();
    expect(first?.source).toBe("buffer");
    expect(first?.degraded).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const second = await render();
    expect(second?.source).toBe("disk");
    expect(second?.degraded).toBe(true);
    expect(detailsCalls).toBe(1);
    expect(mdblistCalls).toBe(1);
  });

  test("renders again once the degraded copy is older than its lifetime", async () => {
    const first = await render();
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const cached = await render();
    expect(first?.degraded).toBe(true);
    if (cached?.source !== "disk") throw new Error("expected a cached degraded poster");

    const expired = new Date(Date.now() - (DEGRADED_POSTER_TTL_SEC + 1) * 1000);
    await utimes(cached.path, expired, expired);

    const again = await render();
    expect(again?.source).toBe("buffer");
    expect(again?.degraded).toBe(true);
  });
});
