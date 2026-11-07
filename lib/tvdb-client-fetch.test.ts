import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fetchTvdbSeriesPoster, tvdbLoginResult } from "@/lib/tvdb-client";

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let requests: string[] = [];
let respond: (url: URL) => Response = () => Response.json({});

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-tvdb-"));
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

const artworks = {
  data: { artworks: [{ image: "https://artworks.thetvdb.com/p.jpg", type: 2, score: 5, language: "eng" }] },
};

describe("tvdb requests", () => {
  test("remembers a rejected key instead of logging in on every poster", async () => {
    respond = () => new Response("unauthorized", { status: 401 });
    const first = await tvdbLoginResult({ apiKey: "bad-key-0001" });
    const second = await tvdbLoginResult({ apiKey: "bad-key-0001" });
    expect(first).toEqual({ ok: false, status: 401, message: "unauthorized" });
    expect(second).toEqual(first);
    expect(requests).toEqual(["/v4/login"]);
  });

  test("caches series artwork and skips login on later renders", async () => {
    respond = (url) => (url.pathname.endsWith("/login") ? Response.json({ data: { token: "t1" } }) : Response.json(artworks));
    const params = { tvdbId: 4242, credentials: { apiKey: "good-key-0002" }, language: "en-US" };
    const first = await fetchTvdbSeriesPoster(params);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await fetchTvdbSeriesPoster({ ...params, credentials: { apiKey: "good-key-0003" } });
    expect(first).toEqual({ url: "https://artworks.thetvdb.com/p.jpg", textless: false });
    expect(second).toEqual(first);
    expect(requests).toEqual(["/v4/login", "/v4/series/4242/artworks"]);
  });

  test("logs in again after the artwork call rejects the token", async () => {
    let artworkCalls = 0;
    respond = (url) => {
      if (url.pathname.endsWith("/login")) return Response.json({ data: { token: "t" } });
      artworkCalls += 1;
      return artworkCalls === 1 ? new Response("", { status: 401 }) : Response.json(artworks);
    };
    const params = { tvdbId: 4343, credentials: { apiKey: "rotating-key-0004" }, language: "en-US" };
    expect(await fetchTvdbSeriesPoster(params)).toBeNull();
    expect((await fetchTvdbSeriesPoster(params))?.url).toBe("https://artworks.thetvdb.com/p.jpg");
    expect(requests).toEqual(["/v4/login", "/v4/series/4343/artworks", "/v4/login", "/v4/series/4343/artworks"]);
  });
});
