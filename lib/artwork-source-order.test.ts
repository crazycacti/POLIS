import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolvePosterImageCandidates } from "@/lib/artwork-poster";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let requests: string[] = [];
let respond: (url: URL) => Response = () => Response.json({});

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-art-order-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url.pathname);
    return respond(url);
  }) as typeof fetch;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

function series(tvdbId: number): ResolvedTitle {
  return {
    imdbId: "tt0000001",
    stremioType: "series",
    title: "Example",
    overview: "",
    releaseYear: "2020",
    releaseInfo: "2020",
    releasedIso: null,
    lastAirDateIso: null,
    status: null,
    runtimeMinutes: null,
    posterPath: "/tmdb-default.jpg",
    backdropPath: null,
    voteAverage: null,
    voteCount: null,
    genreNames: [],
    cast: [],
    castMembers: [],
    directors: [],
    country: null,
    tmdbNumericId: 1,
    tvdbId,
    logoPath: "/tmdb-logo.png",
    certification: null,
    videos: null,
    posterImages: [
      { file_path: "/tmdb-en.jpg", iso_639_1: "en" },
      { file_path: "/tmdb-textless.jpg", iso_639_1: "xx" },
    ],
    logoPaths: ["/tmdb-logo.png"],
  };
}

function tvdbResponds(artworks: object[]) {
  respond = (url) =>
    url.pathname.endsWith("/login")
      ? Response.json({ data: { token: "t" } })
      : Response.json({ data: { artworks } });
}

async function candidatesFor(tvdbId: number) {
  const resolved = series(tvdbId);
  return resolvePosterImageCandidates({
    resolved,
    imdbId: resolved.imdbId,
    credential: { kind: "api_key", key: "tmdb-test" },
    language: "en-US",
    artworkSource: "tvdb",
    artworkMovie: "tmdb",
    artworkFallback: "tmdb",
    fanartApiKey: null,
    tvdbCredentials: { apiKey: `tvdb-test-${tvdbId}` },
    tvdbId,
    preferTextlessArtwork: true,
  });
}

describe("chosen artwork source", () => {
  test("tvdb art comes before a textless tmdb poster", async () => {
    tvdbResponds([
      { image: "https://artworks.thetvdb.com/titled.jpg", type: 2, score: 50, language: "eng", includesText: true },
    ]);
    const { candidates } = await candidatesFor(7001);
    expect(candidates[0]).toEqual({ url: "https://artworks.thetvdb.com/titled.jpg", textless: false });
    expect(candidates[1]).toEqual({ url: "https://image.tmdb.org/t/p/w780/tmdb-textless.jpg", textless: true });
  });

  test("a textless tvdb poster wins over higher scored titled ones", async () => {
    tvdbResponds([
      { image: "https://artworks.thetvdb.com/titled.jpg", type: 2, score: 500, language: "eng", includesText: true },
      { image: "https://artworks.thetvdb.com/clean.jpg", type: 2, score: 5, language: "eng", includesText: false },
    ]);
    const { candidates } = await candidatesFor(7002);
    expect(candidates[0]).toEqual({ url: "https://artworks.thetvdb.com/clean.jpg", textless: true });
  });
});
