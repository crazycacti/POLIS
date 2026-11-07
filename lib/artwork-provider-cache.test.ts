import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fetchAnilistPosterUrl } from "@/lib/anilist-client";
import { fetchFanartLogos, fetchFanartPoster } from "@/lib/fanart-client";
import { fetchJikanPosterUrl } from "@/lib/jikan-client";
import { fetchKitsuPosterUrl } from "@/lib/kitsu-client";

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let requests: URL[] = [];
let respond: (url: URL) => Response = () => Response.json({});

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-artwork-api-"));
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("fanart", () => {
  test("reuses one poster list across keys and languages", async () => {
    respond = () =>
      Response.json({
        movieposter: [
          { url: "https://assets.fanart.tv/de.jpg", lang: "de" },
          { url: "https://assets.fanart.tv/en.jpg", lang: "en" },
        ],
      });
    const base = { mediaType: "movie" as const, tmdbId: 501, tvdbId: null };
    const en = await fetchFanartPoster({ ...base, apiKey: "fan-key-1", language: "en-US" });
    await settle();
    const de = await fetchFanartPoster({ ...base, apiKey: "fan-key-2", language: "de-DE" });
    expect(en.candidate?.url).toBe("https://assets.fanart.tv/en.jpg");
    expect(de.candidate?.url).toBe("https://assets.fanart.tv/de.jpg");
    expect(requests).toHaveLength(1);
  });

  test("remembers titles fanart has no art for", async () => {
    respond = () => Response.json({ status: "error" }, { status: 404 });
    const params = { mediaType: "movie" as const, tmdbId: 502, tvdbId: null, apiKey: "fan-key-3", language: "en" };
    expect(await fetchFanartPoster(params)).toEqual({ candidate: null, degraded: false });
    await settle();
    expect(await fetchFanartPoster(params)).toEqual({ candidate: null, degraded: false });
    expect(requests).toHaveLength(1);
  });

  test("ranks title logos by language and hd first from the cached poster response", async () => {
    respond = () =>
      Response.json({
        tvposter: [{ url: "https://assets.fanart.tv/p.jpg", lang: "en" }],
        hdtvlogo: [
          { url: "https://assets.fanart.tv/hd-ru.png", lang: "ru", likes: "40" },
          { url: "https://assets.fanart.tv/hd-en.png", lang: "en", likes: "2" },
          { url: "https://assets.fanart.tv/hd-de.png", lang: "de", likes: "1" },
        ],
        clearlogo: [
          { url: "https://assets.fanart.tv/sd-en.png", lang: "en", likes: "90" },
          { url: "https://assets.fanart.tv/sd-xx.png", lang: "xx", likes: "1" },
        ],
      });
    const base = { mediaType: "series" as const, tmdbId: 1, tvdbId: 504, apiKey: "fan-key-5" };
    const poster = await fetchFanartPoster({ ...base, language: "en-US" });
    await settle();
    const en = await fetchFanartLogos({ ...base, language: "en-US" });
    const de = await fetchFanartLogos({ ...base, language: "de-DE" });
    expect(poster.candidate?.url).toBe("https://assets.fanart.tv/p.jpg");
    expect(en.urls).toEqual([
      "https://assets.fanart.tv/hd-en.png",
      "https://assets.fanart.tv/sd-en.png",
      "https://assets.fanart.tv/sd-xx.png",
    ]);
    expect(de.urls[0]).toBe("https://assets.fanart.tv/hd-de.png");
    expect(requests).toHaveLength(1);
  });

  test("reports a lookup that could not reach fanart as degraded", async () => {
    respond = () => new Response("{}", { status: 503 });
    const params = { mediaType: "movie" as const, tmdbId: 503, tvdbId: null, apiKey: "fan-key-4", language: "en" };
    expect(await fetchFanartPoster(params)).toEqual({ candidate: null, degraded: true });
  });
});

describe("anime providers", () => {
  test("anilist stops calling after a 429 until Retry-After passes", async () => {
    respond = () => new Response("{}", { status: 429, headers: { "retry-after": "60" } });
    expect(await fetchAnilistPosterUrl({ title: "Alpha Show", releaseYear: "2020" })).toEqual({ url: null, degraded: true });
    expect(await fetchAnilistPosterUrl({ title: "Beta Show", releaseYear: "2020" })).toEqual({ url: null, degraded: true });
    expect(requests).toHaveLength(1);
  });

  test("kitsu caches the search rows and picks by year", async () => {
    respond = () =>
      Response.json({
        data: [
          { attributes: { startDate: "2010-04-01", posterImage: { large: "https://media.kitsu.app/2010.jpg" } } },
          { attributes: { startDate: "2021-04-01", posterImage: { large: "https://media.kitsu.app/2021.jpg" } } },
        ],
      });
    expect((await fetchKitsuPosterUrl({ title: "Gamma", releaseYear: "2021" })).url).toBe("https://media.kitsu.app/2021.jpg");
    await settle();
    expect((await fetchKitsuPosterUrl({ title: " gamma ", releaseYear: "2010" })).url).toBe("https://media.kitsu.app/2010.jpg");
    expect(requests).toHaveLength(1);
  });

  test("jikan spaces requests to stay under its per second limit", async () => {
    respond = () =>
      Response.json({ data: [{ mal_id: 1, year: 2020, images: { jpg: { large_image_url: "https://cdn.myanimelist.net/a.jpg" } } }] });
    const started = Date.now();
    const urls = await Promise.all(
      ["Delta", "Epsilon", "Zeta"].map((title) => fetchJikanPosterUrl({ title, releaseYear: "2020" })),
    );
    expect(urls).toEqual(Array(3).fill({ url: "https://cdn.myanimelist.net/a.jpg", degraded: false }));
    expect(requests).toHaveLength(3);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });
});
