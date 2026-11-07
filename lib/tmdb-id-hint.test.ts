import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { tmdbImdbIdForItem } from "@/lib/stremio-catalog-fetch";
import { findTmdbTitle, resolveTitleFromImdb } from "@/lib/tmdb-resolve";

const IMDB_ID = "tt0990202";
const TMDB_TV_ID = 990202;
const TMDB_MOVIE_ID = 880202;
const CREDENTIAL = { kind: "api_key", key: "id-hint-tmdb" } as const;

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let findCalls = 0;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-id-hint-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  findCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === `/3/tv/${TMDB_TV_ID}/external_ids`) {
      return Response.json({ imdb_id: IMDB_ID, tvdb_id: null });
    }
    if (url.pathname === `/3/tv/${TMDB_TV_ID}`) {
      return Response.json({ id: TMDB_TV_ID, name: "Hinted Show", number_of_seasons: 0, genres: [] });
    }
    if (url.pathname.startsWith("/3/find/")) {
      findCalls += 1;
      return Response.json({ movie_results: [{ id: TMDB_MOVIE_ID }], tv_results: [] });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

describe("imdb to tmdb resolution", () => {
  test("a title seen in a catalog row resolves without a TMDB find call", async () => {
    const imdbId = await tmdbImdbIdForItem({
      tmdbId: TMDB_TV_ID,
      stremioType: "series",
      credential: CREDENTIAL,
    });
    expect(imdbId).toBe(IMDB_ID);

    expect(await findTmdbTitle(IMDB_ID, CREDENTIAL, "en-US")).toEqual({
      stremioType: "series",
      tmdbId: TMDB_TV_ID,
    });
    expect(findCalls).toBe(0);
  });

  test("a title never seen in a catalog still uses TMDB find", async () => {
    expect(await findTmdbTitle(IMDB_ID, CREDENTIAL, "en-US")).toEqual({
      stremioType: "movie",
      tmdbId: TMDB_MOVIE_ID,
    });
    expect(findCalls).toBe(1);
  });

  test("meta for a title seen in a catalog row skips the TMDB find call", async () => {
    await tmdbImdbIdForItem({ tmdbId: TMDB_TV_ID, stremioType: "series", credential: CREDENTIAL });

    const resolved = await resolveTitleFromImdb({
      imdbId: IMDB_ID,
      stremioType: "series",
      credential: CREDENTIAL,
      language: "en-US",
    });
    expect(resolved?.tmdbNumericId).toBe(TMDB_TV_ID);
    expect(resolved?.title).toBe("Hinted Show");
    expect(findCalls).toBe(0);
  });

  test("meta asks TMDB find when the catalog saw the title as another type", async () => {
    await tmdbImdbIdForItem({ tmdbId: TMDB_TV_ID, stremioType: "series", credential: CREDENTIAL });

    await resolveTitleFromImdb({
      imdbId: IMDB_ID,
      stremioType: "movie",
      credential: CREDENTIAL,
      language: "en-US",
    });
    expect(findCalls).toBe(1);
  });

  test("a title found with TMDB find keeps its id after the find response expires", async () => {
    await findTmdbTitle(IMDB_ID, CREDENTIAL, "en-US");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await readdir(path.join(root, "tmdb-id"), { recursive: true })).not.toHaveLength(0);
    await rm(path.join(root, "api"), { recursive: true, force: true });

    expect(await findTmdbTitle(IMDB_ID, CREDENTIAL, "en-US")).toEqual({
      stremioType: "movie",
      tmdbId: TMDB_MOVIE_ID,
    });
    expect(findCalls).toBe(1);
  });
});
