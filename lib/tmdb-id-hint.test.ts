import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { writePolisDiskJson } from "@/lib/polis-disk-cache";
import { tmdbImdbIdForItem } from "@/lib/stremio-catalog-fetch";
import {
  findTmdbTitle,
  rememberTmdbIdHint,
  resolveTitleForArtwork,
  resolveTitleFromImdb,
  TMDB_ID_HINT_TTL_SEC,
} from "@/lib/tmdb-resolve";

const IMDB_ID = "tt0990202";
const TMDB_TV_ID = 990202;
const TMDB_MOVIE_ID = 880202;
const MERGED_TV_ID = 770202;
const ALMOST_EXPIRED_MS = 100;
const CREDENTIAL = { kind: "api_key", key: "id-hint-tmdb" } as const;

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let findCalls = 0;
let findMovieId: number | null = TMDB_MOVIE_ID;
let findTvId: number | null = null;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-id-hint-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  findCalls = 0;
  findMovieId = TMDB_MOVIE_ID;
  findTvId = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === `/3/tv/${TMDB_TV_ID}/external_ids`) {
      return Response.json({ imdb_id: IMDB_ID, tvdb_id: null });
    }
    if (url.pathname === `/3/tv/${TMDB_TV_ID}`) {
      return Response.json({ id: TMDB_TV_ID, name: "Hinted Show", number_of_seasons: 0, genres: [] });
    }
    if (url.pathname === `/3/movie/${TMDB_MOVIE_ID}`) {
      return Response.json({ id: TMDB_MOVIE_ID, title: "Found Movie", genres: [] });
    }
    if (url.pathname.startsWith("/3/find/")) {
      findCalls += 1;
      return Response.json({
        movie_results: findMovieId != null ? [{ id: findMovieId }] : [],
        tv_results: findTvId != null ? [{ id: findTvId }] : [],
      });
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

  test("a movie hint wins over a series hint when the type is not known", async () => {
    await rememberTmdbIdHint(IMDB_ID, { stremioType: "series", tmdbId: TMDB_TV_ID });
    await rememberTmdbIdHint(IMDB_ID, { stremioType: "movie", tmdbId: TMDB_MOVIE_ID });
    expect(await findTmdbTitle(IMDB_ID, CREDENTIAL, "en-US")).toEqual({
      stremioType: "movie",
      tmdbId: TMDB_MOVIE_ID,
    });
    expect(findCalls).toBe(0);
  });

  test("meta for one type never uses the hint of the other type", async () => {
    await rememberTmdbIdHint(IMDB_ID, { stremioType: "movie", tmdbId: TMDB_MOVIE_ID });
    findTvId = TMDB_TV_ID;
    const resolved = await resolveTitleFromImdb({
      imdbId: IMDB_ID,
      stremioType: "series",
      credential: CREDENTIAL,
      language: "en-US",
    });
    expect(resolved?.tmdbNumericId).toBe(TMDB_TV_ID);
    expect(findCalls).toBe(1);
  });

  test("ignores hint files written before hints were keyed by type", async () => {
    await writePolisDiskJson("tmdb-id", "g", IMDB_ID, { stremioType: "series", tmdbId: TMDB_TV_ID });
    expect(await findTmdbTitle(IMDB_ID, CREDENTIAL, "en-US")).toEqual({
      stremioType: "movie",
      tmdbId: TMDB_MOVIE_ID,
    });
    expect(findCalls).toBe(1);
  });

  test("meta replaces a hint whose tmdb title was deleted or merged", async () => {
    await rememberTmdbIdHint(IMDB_ID, { stremioType: "series", tmdbId: MERGED_TV_ID });
    findTvId = TMDB_TV_ID;
    const resolve = () =>
      resolveTitleFromImdb({ imdbId: IMDB_ID, stremioType: "series", credential: CREDENTIAL, language: "en-US" });

    expect((await resolve())?.tmdbNumericId).toBe(TMDB_TV_ID);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await resolve())?.tmdbNumericId).toBe(TMDB_TV_ID);
    expect(findCalls).toBe(1);
  });

  test("artwork replaces a hint whose tmdb title was deleted or merged", async () => {
    await rememberTmdbIdHint(IMDB_ID, { stremioType: "series", tmdbId: MERGED_TV_ID });
    findMovieId = null;
    findTvId = TMDB_TV_ID;

    const resolved = await resolveTitleForArtwork(IMDB_ID, CREDENTIAL, "en-US");
    expect(resolved?.tmdbNumericId).toBe(TMDB_TV_ID);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await findTmdbTitle(IMDB_ID, CREDENTIAL, "en-US")).toEqual({ stremioType: "series", tmdbId: TMDB_TV_ID });
    expect(findCalls).toBe(1);
  });

  test("a remembered hint expires with the age of its file", async () => {
    process.env.POLIS_CACHE_DIR = path.join(root, "before-restart");
    await rememberTmdbIdHint(IMDB_ID, { stremioType: "series", tmdbId: TMDB_TV_ID });
    const restarted = path.join(root, "after-restart");
    await cp(path.join(root, "before-restart", "tmdb-id"), path.join(restarted, "tmdb-id"), { recursive: true });
    const [file] = await readdir(path.join(restarted, "tmdb-id", "g"));
    const aged = new Date(Date.now() - TMDB_ID_HINT_TTL_SEC * 1000 + ALMOST_EXPIRED_MS);
    await utimes(path.join(restarted, "tmdb-id", "g", file ?? ""), aged, aged);
    process.env.POLIS_CACHE_DIR = restarted;

    expect(await findTmdbTitle(IMDB_ID, CREDENTIAL, "en-US")).toEqual({ stremioType: "series", tmdbId: TMDB_TV_ID });
    await new Promise((resolve) => setTimeout(resolve, ALMOST_EXPIRED_MS * 2));
    expect(await findTmdbTitle(IMDB_ID, CREDENTIAL, "en-US")).toEqual({
      stremioType: "movie",
      tmdbId: TMDB_MOVIE_ID,
    });
    expect(findCalls).toBe(1);
  });
});
