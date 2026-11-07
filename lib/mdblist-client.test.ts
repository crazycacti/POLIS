import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { writePolisDiskJson } from "@/lib/polis-disk-cache";
import { fetchMdblistMediaInfo } from "@/lib/mdblist-client";

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let requests: URL[] = [];
let respond: (url: URL) => Response = () => new Response("{}");

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-mdblist-"));
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

const ratingsPayload = {
  ratings: [{ source: "imdb", value: 7.4 }],
  keywords: [{ name: "Certified Fresh" }],
};

function lookup(imdbId: string, apiKey: string, serverKeyProfile: string | null = null) {
  return fetchMdblistMediaInfo({ imdbId, stremioType: "movie", apiKey, serverKeyProfile });
}

async function seedStale(imdbId: string) {
  const day = 24 * 60 * 60 * 1000;
  await writePolisDiskJson("api/mdblist", "g", ["media-v1", "movie", imdbId].join("\0"), {
    at: Date.now() - 2 * day,
    value: { ratings: { imdb: 6.1 }, releaseDate: null, status: null, keywordNames: [], certification: null, filenames: [] },
  });
}

describe("fetchMdblistMediaInfo", () => {
  test("calls MDBList once per title and serves the parsed copy after that", async () => {
    respond = () => Response.json(ratingsPayload);
    const first = await lookup("tt0000101", "key-cache");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await lookup("tt0000101", "another-key");
    expect(first.info?.keywordNames).toEqual(["certified-fresh"]);
    expect(second).toEqual(first);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get("append_to_response")).toBe("keyword");
  });

  test("serves the stale copy without degrading when MDBList returns 429", async () => {
    await seedStale("tt0000102");
    respond = () => new Response("{}", { status: 429 });
    const result = await lookup("tt0000102", "key-429-stale");
    expect(result).toEqual({
      info: expect.objectContaining({ ratings: { imdb: 6.1 } }),
      degraded: false,
    });
  });

  test("marks the render degraded and stops calling after a 429 with nothing cached", async () => {
    respond = () => new Response("{}", { status: 429 });
    expect(await lookup("tt0000103", "key-429-cold")).toEqual({ info: null, degraded: true });
    expect(await lookup("tt0000104", "key-429-cold")).toEqual({ info: null, degraded: true });
    expect(requests).toHaveLength(1);
  });

  test("treats 404 as a known miss with a single request", async () => {
    respond = () => new Response("{}", { status: 404 });
    expect(await lookup("tt0000105", "key-404")).toEqual({ info: null, degraded: false });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.hostname).toBe("api.mdblist.com");
  });

  test("caps one profile's share of the server key", async () => {
    process.env.POLIS_MDBLIST_DAILY_LIMIT = "10";
    process.env.POLIS_SERVER_KEY_DAILY_SHARE_PER_PROFILE = "20";
    respond = () => Response.json(ratingsPayload);
    expect((await lookup("tt0000106", "server-key", "profile-a")).info).not.toBeNull();
    expect((await lookup("tt0000107", "server-key", "profile-a")).info).not.toBeNull();
    expect(await lookup("tt0000108", "server-key", "profile-a")).toEqual({ info: null, degraded: true });
    expect((await lookup("tt0000108", "server-key", "profile-b")).info).not.toBeNull();
    expect((await lookup("tt0000109", "own-key", null)).info).not.toBeNull();
    expect(requests).toHaveLength(4);
  });
});
