import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { writePolisDiskJson } from "@/lib/polis-disk-cache";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import { resolveTitleFromImdb } from "@/lib/tmdb-resolve";

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let requests: URL[] = [];
let respond: (url: URL) => Response = () => Response.json({});

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-tmdb-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    return respond(url);
  }) as typeof fetch;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

async function cachedFileText(): Promise<string> {
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  const texts = await Promise.all(
    files.filter((f) => f.isFile()).map((f) => readFile(path.join(f.parentPath, f.name), "utf8")),
  );
  return texts.join("\n");
}

describe("tmdbApiGet", () => {
  test("shares cached public data across keys and never stores the key", async () => {
    respond = () => Response.json({ id: 1 });
    const url = new URL("https://api.themoviedb.org/3/movie/1?language=en-US");
    expect(await tmdbApiGet(url, { kind: "api_key", key: "secret-key-one" })).toEqual({ id: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await tmdbApiGet(url, { kind: "bearer", token: "secret-token-two" })).toEqual({ id: 1 });
    expect(requests).toHaveLength(1);
    expect(await cachedFileText()).not.toContain("secret-key-one");
  });

  test("serves the older copy when TMDB rate limits or fails", async () => {
    const url = new URL("https://api.themoviedb.org/3/movie/2?language=en-US");
    await writePolisDiskJson("api/tmdb", "g", `${url.pathname}${url.search}`, {
      at: Date.now() - 3 * 24 * 60 * 60 * 1000,
      value: { id: 2, vote_average: 6 },
    });
    respond = () => new Response("{}", { status: 503 });
    expect(await tmdbApiGet(url, { kind: "api_key", key: "k-503" })).toEqual({ id: 2, vote_average: 6 });
    respond = () => new Response("{}", { status: 429, headers: { "retry-after": "5" } });
    expect(await tmdbApiGet(url, { kind: "api_key", key: "k-429" })).toEqual({ id: 2, vote_average: 6 });
  });
});

describe("tmdb logo lookup", () => {
  test("asks for the user language, English and textless logos, then falls back to all", async () => {
    respond = (url) => {
      if (url.pathname.startsWith("/3/find/")) return Response.json({ movie_results: [{ id: 77 }] });
      if (url.pathname === "/3/movie/77") return Response.json({ title: "Seventy" });
      if (url.pathname === "/3/movie/77/images") {
        const filtered = url.searchParams.get("include_image_language");
        return Response.json({ logos: filtered ? [] : [{ file_path: "/ja.png", iso_639_1: "ja" }] });
      }
      return Response.json({});
    };
    const resolved = await resolveTitleFromImdb({
      imdbId: "tt0077077",
      stremioType: "movie",
      credential: { kind: "api_key", key: "logo-key" },
      language: "de-DE",
    });
    expect(resolved?.logoPath).toBe("/ja.png");
    const imageCalls = requests.filter((u) => u.pathname.endsWith("/images"));
    expect(imageCalls.map((u) => u.searchParams.get("include_image_language"))).toEqual([
      "de,en,null,xx",
      null,
    ]);
  });
});
