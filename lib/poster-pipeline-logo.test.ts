import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { renderPosterForImdb } from "@/lib/poster-pipeline";
import { parsePosterOverlayQuery } from "@/lib/poster-query";

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let requests: string[] = [];
let tvdbArtworks: object[] = [];
let posterJpeg = Buffer.alloc(0);
let logoPng = Buffer.alloc(0);

const TVDB_TITLED = "https://artworks.thetvdb.com/titled.jpg";
const TVDB_CLEAN = "https://artworks.thetvdb.com/clean.jpg";
const TVDB_LOGO = "https://artworks.thetvdb.com/logo.png";
const TMDB_LOGO = "https://image.tmdb.org/t/p/w500/tmdb-logo.png";

beforeAll(async () => {
  const solid = { r: 40, g: 60, b: 80, alpha: 1 };
  posterJpeg = await sharp({ create: { width: 500, height: 750, channels: 4, background: solid } }).jpeg().toBuffer();
  logoPng = await sharp({
    create: { width: 400, height: 150, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).png().toBuffer();
});

let nextId = 100;

function tmdbResponse(url: URL, tmdbId: number, tvdbId: number): Response {
  if (url.pathname.startsWith("/3/find/")) return Response.json({ tv_results: [{ id: tmdbId }] });
  return Response.json({
    name: "Example",
    first_air_date: "2020-01-01",
    poster_path: "/tmdb-poster.jpg",
    images: {
      posters: [{ file_path: "/tmdb-textless.jpg", iso_639_1: "xx" }],
      logos: [{ file_path: "/tmdb-logo.png", iso_639_1: "en" }],
      backdrops: [],
    },
    external_ids: { tvdb_id: tvdbId },
  });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-pipeline-logo-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  requests = [];
  nextId += 1;
  const tmdbId = nextId;
  const tvdbId = nextId + 5000;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(`${url.origin}${url.pathname}`);
    if (url.hostname === "api.themoviedb.org") return tmdbResponse(url, tmdbId, tvdbId);
    if (url.pathname.endsWith("/login")) return Response.json({ data: { token: "t" } });
    if (url.hostname === "api4.thetvdb.com") return Response.json({ data: { artworks: tvdbArtworks } });
    if (url.pathname.endsWith(".png")) return new Response(new Uint8Array(logoPng));
    return new Response(new Uint8Array(posterJpeg));
  }) as typeof fetch;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

async function render(query: string) {
  const image = await renderPosterForImdb({
    imdbId: `tt09${nextId}`,
    overlay: parsePosterOverlayQuery(new URLSearchParams(query)),
    credential: { kind: "api_key", key: "tmdb-test" },
    language: "en-US",
    mdblistApiKey: null,
    fanartApiKey: null,
    tvdbCredentials: { apiKey: `tvdb-test-${nextId}` },
  });
  expect(image).not.toBeNull();
  return requests;
}

describe("poster title logo", () => {
  test("tvdb art with text gets no logo even when tmdb has a textless poster", async () => {
    tvdbArtworks = [
      { image: TVDB_TITLED, type: 2, score: 9, language: "eng", includesText: true },
      { image: TVDB_LOGO, type: 23, score: 9, language: "eng" },
    ];
    const seen = await render("artwork=tvdb&artwork_fb=tmdb&logo=1");
    expect(seen).toContain(TVDB_TITLED);
    expect(seen).not.toContain("https://image.tmdb.org/t/p/w780/tmdb-textless.jpg");
    expect(seen).not.toContain(TVDB_LOGO);
    expect(seen).not.toContain(TMDB_LOGO);
  });

  test("textless tvdb art draws the tvdb logo instead of the tmdb one", async () => {
    tvdbArtworks = [
      { image: TVDB_CLEAN, type: 2, score: 9, language: "eng", includesText: false },
      { image: TVDB_LOGO, type: 23, score: 9, language: "eng" },
    ];
    const seen = await render("artwork=tvdb&artwork_fb=tmdb&logo=1");
    expect(seen).toContain(TVDB_CLEAN);
    expect(seen).toContain(TVDB_LOGO);
    expect(seen).not.toContain(TMDB_LOGO);
  });

  test("a profile logo order of tmdb first uses the tmdb logo on tvdb art", async () => {
    tvdbArtworks = [
      { image: TVDB_CLEAN, type: 2, score: 9, language: "eng", includesText: false },
      { image: TVDB_LOGO, type: 23, score: 9, language: "eng" },
    ];
    const seen = await render("artwork=tvdb&artwork_fb=tmdb&logo=1&logo_src=tmdb,tvdb");
    expect(seen).toContain(TMDB_LOGO);
    expect(seen).not.toContain(TVDB_LOGO);
  });
});
