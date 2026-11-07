import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { POSTER_OVERLAY_DEFAULTS } from "@/lib/poster-query";
import {
  DEGRADED_POSTER_MAX_TTL_SEC,
  DEGRADED_POSTER_TTL_SEC,
  degradedPosterTtlMs,
  renderPosterForImdbCached,
} from "@/lib/poster-render-cache";

const IMDB_ID = "tt0990101";
const TMDB_ID = 990101;
const SETTLE_MS = 50;
const MDBLIST_PAUSE_SEC = 3 * 60 * 60;

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let detailsCalls = 0;
let mdblistCalls = 0;
let mdblistStatus = 429;
let mdblistKeySerial = 0;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-degraded-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  detailsCalls = 0;
  mdblistCalls = 0;
  mdblistStatus = 429;
  mdblistKeySerial += 1;
  const jpeg = await sharp({ create: { width: 50, height: 75, channels: 3, background: "#456" } }).jpeg().toBuffer();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.mdblist.com") {
      mdblistCalls += 1;
      return mdblistStatus === 429
        ? Response.json(
            { error: "Daily API limit reached" },
            { status: 429, headers: { "retry-after": String(MDBLIST_PAUSE_SEC) } },
          )
        : new Response("unavailable", { status: mdblistStatus });
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
    mdblistApiKey: `degraded-render-mdblist-${mdblistKeySerial}`,
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

  test("keeps the degraded copy while MDBList stays paused past the short lifetime", async () => {
    const cached = await cachedDegradedPoster();
    await ageFile(cached, DEGRADED_POSTER_TTL_SEC + 60);

    const later = await render();
    expect(later?.source).toBe("disk");
    expect(later?.degraded).toBe(true);
    expect(detailsCalls).toBe(1);
    expect(mdblistCalls).toBe(1);
  });

  test("renders again once the MDBList pause can no longer cover the degraded copy", async () => {
    const cached = await cachedDegradedPoster();
    await ageFile(cached, MDBLIST_PAUSE_SEC + 60);

    const again = await render();
    expect(again?.source).toBe("buffer");
    expect(again?.degraded).toBe(true);
  });

  test("renders again after the short lifetime when MDBList failed without a pause", async () => {
    mdblistStatus = 503;
    const cached = await cachedDegradedPoster();
    await ageFile(cached, DEGRADED_POSTER_TTL_SEC + 60);

    const again = await render();
    expect(again?.source).toBe("buffer");
    expect(again?.degraded).toBe(true);
    expect(mdblistCalls).toBe(2);
  });
});

async function cachedDegradedPoster(): Promise<string> {
  const first = await render();
  expect(first?.degraded).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const cached = await render();
  if (cached?.source !== "disk") throw new Error("expected a cached degraded poster");
  return cached.path;
}

async function ageFile(file: string, ageSec: number): Promise<void> {
  const past = new Date(Date.now() - ageSec * 1000);
  await utimes(file, past, past);
}

describe("degradedPosterTtlMs", () => {
  const now = Date.UTC(2026, 0, 1, 12);
  const minute = 60 * 1000;

  test("follows the provider pause between the short and long lifetimes", () => {
    expect(degradedPosterTtlMs([now + 90 * minute], now)).toBe(90 * minute);
    expect(degradedPosterTtlMs([now + minute], now)).toBe(DEGRADED_POSTER_TTL_SEC * 1000);
    expect(degradedPosterTtlMs([now + 24 * 60 * minute], now)).toBe(DEGRADED_POSTER_MAX_TTL_SEC * 1000);
  });

  test("uses the short lifetime when any degraded source has no known pause", () => {
    expect(degradedPosterTtlMs([now + 90 * minute, undefined], now)).toBe(DEGRADED_POSTER_TTL_SEC * 1000);
    expect(degradedPosterTtlMs([], now)).toBe(DEGRADED_POSTER_TTL_SEC * 1000);
  });
});
