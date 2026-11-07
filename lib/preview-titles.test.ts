import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fetchPreviewTitles, PREVIEW_TITLE_LIMIT, tmdbCredentialFromRaw } from "@/lib/preview-titles";

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let requests: URL[] = [];

const TRENDING_ROWS = [
  { id: 1, media_type: "movie", title: "Movie One" },
  { id: 2, media_type: "person", name: "Someone" },
  { id: 3, media_type: "tv", name: "Show Three" },
  { id: 4, media_type: "movie", title: "No Imdb" },
  ...Array.from({ length: 10 }, (_, index) => ({
    id: 100 + index,
    media_type: "movie",
    title: `Extra ${index}`,
  })),
];

function imdbFor(tmdbId: number): string | null {
  return tmdbId === 4 ? null : `tt${String(1000000 + tmdbId)}`;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-preview-titles-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    if (url.pathname.endsWith("/trending/all/week")) {
      return Response.json({ results: TRENDING_ROWS });
    }
    const match = url.pathname.match(/\/(movie|tv)\/(\d+)\/external_ids$/);
    if (match) return Response.json({ imdb_id: imdbFor(Number(match[2])) });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

describe("fetchPreviewTitles", () => {
  test("returns trending movies and shows with imdb ids, skipping people and titles without one", async () => {
    const titles = await fetchPreviewTitles({ kind: "api_key", key: "test-key" });
    expect(titles).toHaveLength(PREVIEW_TITLE_LIMIT);
    expect(titles[0]).toEqual({ imdbId: "tt1000001", title: "Movie One", type: "movie" });
    expect(titles[1]).toEqual({ imdbId: "tt1000003", title: "Show Three", type: "series" });
    expect(titles.some((title) => title.title === "No Imdb" || title.title === "Someone")).toBe(false);
  });

  test("serves the list from cache without calling TMDB again", async () => {
    const first = await fetchPreviewTitles({ kind: "api_key", key: "test-key" });
    const callsAfterFirst = requests.length;
    const second = await fetchPreviewTitles({ kind: "bearer", token: "other-token" });
    expect(second).toEqual(first);
    expect(requests.length).toBe(callsAfterFirst);
  });

  test("never writes the key into the trending request path", async () => {
    await fetchPreviewTitles({ kind: "bearer", token: "secret-token" });
    expect(requests.every((url) => !url.toString().includes("secret-token"))).toBe(true);
  });
});

describe("tmdbCredentialFromRaw", () => {
  test("reads a v3 key and a read access token", () => {
    expect(tmdbCredentialFromRaw("0123456789abcdef0123456789abcdef")).toEqual({
      kind: "api_key",
      key: "0123456789abcdef0123456789abcdef",
    });
    expect(tmdbCredentialFromRaw("eyJhbGciOiJIUzI1NiJ9.payload.sig")?.kind).toBe("bearer");
    expect(tmdbCredentialFromRaw("   ")).toBeNull();
  });
});
