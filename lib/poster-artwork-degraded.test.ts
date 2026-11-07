import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { getPosterBaseBufferCached } from "@/lib/poster-artwork-cache";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let fanartCalls = 0;
let fanartUp = false;

const resolved: ResolvedTitle = {
  imdbId: "tt0990001",
  stremioType: "movie",
  title: "Degraded",
  overview: "",
  releaseYear: "2020",
  releaseInfo: "2020",
  releasedIso: null,
  lastAirDateIso: null,
  status: null,
  runtimeMinutes: null,
  posterPath: "/tmdb.jpg",
  backdropPath: null,
  voteAverage: null,
  voteCount: null,
  genreNames: [],
  cast: [],
  castMembers: [],
  directors: [],
  country: null,
  tmdbNumericId: 990001,
  tvdbId: null,
  logoPath: null,
  certification: null,
  videos: null,
  posterImages: [{ file_path: "/tmdb.jpg", iso_639_1: "en" }],
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-base-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  fanartCalls = 0;
  fanartUp = false;
  const jpeg = await sharp({ create: { width: 50, height: 75, channels: 3, background: "#345" } }).jpeg().toBuffer();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "webservice.fanart.tv") {
      fanartCalls += 1;
      return fanartUp
        ? Response.json({ movieposter: [{ url: "https://assets.fanart.tv/f.jpg", lang: "en" }] })
        : new Response("{}", { status: 503 });
    }
    return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg" } });
  }) as typeof fetch;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

function base() {
  return getPosterBaseBufferCached({
    imdbId: resolved.imdbId,
    overlay: {
      artwork: "fanart",
      artworkMovie: "fanart",
      artworkFallback: "tmdb",
      logoOnPoster: false,
      posterShape: "poster",
    },
    resolved,
    credential: { kind: "api_key", key: "base-key" },
    language: "en-US",
    fanartApiKey: "fanart-down-key",
    tvdbCredentials: null,
    configId: null,
  });
}

describe("poster artwork when a provider is down", () => {
  test("uses fallback art without caching it, then caches once the provider answers", async () => {
    expect((await base())?.degraded).toBe(true);
    expect((await base())?.degraded).toBe(true);
    expect(fanartCalls).toBe(2);

    fanartUp = true;
    expect((await base())?.degraded).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await base();
    expect(fanartCalls).toBe(3);
  });
});
