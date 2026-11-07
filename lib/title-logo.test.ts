import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ResolvedTitle } from "@/lib/tmdb-resolve";
import { resolveTitleLogoRefs, titleLogoSourceOrder } from "@/lib/title-logo";
import type { TitleLogoSource } from "@/lib/poster-query";

let root = "";
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;
let requests: string[] = [];
let tvdbLogos: object[] = [];
let fanartLogos: object[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-title-logo-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
  requests = [];
  tvdbLogos = [];
  fanartLogos = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(`${url.hostname}${url.pathname}`);
    if (url.pathname.endsWith("/login")) return Response.json({ data: { token: "t" } });
    if (url.hostname === "api4.thetvdb.com") {
      return Response.json({ data: { artworks: tvdbLogos } });
    }
    if (url.hostname === "webservice.fanart.tv") {
      return Response.json({ tvposter: [], hdtvlogo: fanartLogos });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

let nextTvdbId = 9100;

function series(tmdbLogoPaths: string[]): ResolvedTitle {
  nextTvdbId += 1;
  return {
    imdbId: "tt0000002",
    stremioType: "series",
    title: "Example",
    overview: "",
    releaseYear: "2020",
    releaseInfo: "2020",
    releasedIso: null,
    lastAirDateIso: null,
    status: null,
    runtimeMinutes: null,
    posterPath: null,
    backdropPath: null,
    voteAverage: null,
    voteCount: null,
    genreNames: [],
    cast: [],
    castMembers: [],
    directors: [],
    country: null,
    tmdbNumericId: 2,
    tvdbId: nextTvdbId,
    logoPath: tmdbLogoPaths[0] ?? null,
    certification: null,
    videos: null,
    logoPaths: tmdbLogoPaths,
  };
}

async function logosFor(
  resolved: ResolvedTitle,
  order: TitleLogoSource[],
  keys: { fanart?: boolean; tvdb?: boolean } = { fanart: true, tvdb: true },
  language = "en-US",
) {
  return resolveTitleLogoRefs({
    resolved,
    order,
    language,
    fanartApiKey: keys.fanart ? "fanart-test" : null,
    tvdbCredentials: keys.tvdb ? { apiKey: `tvdb-test-${resolved.tvdbId}` } : null,
  });
}

const TVDB_LOGO = "https://artworks.thetvdb.com/logo-eng.png";
const FANART_LOGO = "https://assets.fanart.tv/logo-en.png";

describe("title logo source order", () => {
  test("puts the chosen art source first, then tmdb, fanart and tvdb", () => {
    expect(titleLogoSourceOrder("tvdb", "auto")).toEqual(["tvdb", "tmdb", "fanart"]);
    expect(titleLogoSourceOrder("fanart", "auto")).toEqual(["fanart", "tmdb", "tvdb"]);
    expect(titleLogoSourceOrder("tmdb", "auto")).toEqual(["tmdb", "fanart", "tvdb"]);
    expect(titleLogoSourceOrder("anilist", "auto")).toEqual(["tmdb", "fanart", "tvdb"]);
  });

  test("uses a profile's own order over the art source", () => {
    expect(titleLogoSourceOrder("tvdb", "fanart,tmdb")).toEqual(["fanart", "tmdb"]);
    expect(titleLogoSourceOrder("tvdb", "fanart,fanart")).toEqual(["tvdb", "tmdb", "fanart"]);
  });
});

describe("title logo chain", () => {
  test("uses the tvdb clearlogo when tvdb is the art source", async () => {
    tvdbLogos = [{ image: TVDB_LOGO, type: 23, score: 1, language: "eng" }];
    const result = await logosFor(series(["/tmdb.png"]), ["tvdb", "tmdb", "fanart"]);
    expect(result).toEqual({ refs: [TVDB_LOGO], degraded: false });
  });

  test("falls back to the tmdb logo when tvdb has none", async () => {
    const result = await logosFor(series(["/tmdb.png", "/tmdb-2.png"]), ["tvdb", "tmdb", "fanart"]);
    expect(result.refs).toEqual(["/tmdb.png", "/tmdb-2.png"]);
    expect(requests.some((r) => r.startsWith("webservice.fanart.tv"))).toBe(false);
  });

  test("falls back to fanart when tvdb and tmdb have no logo", async () => {
    fanartLogos = [{ url: FANART_LOGO, lang: "en", likes: "3" }];
    const result = await logosFor(series([]), ["tvdb", "tmdb", "fanart"]);
    expect(result.refs).toEqual([FANART_LOGO]);
  });

  test("falls back to tvdb last for tmdb art", async () => {
    tvdbLogos = [{ image: TVDB_LOGO, type: 23, score: 1, language: "eng" }];
    const result = await logosFor(series([]), ["tmdb", "fanart", "tvdb"]);
    expect(result.refs).toEqual([TVDB_LOGO]);
  });

  test("draws no logo when no source has one", async () => {
    const result = await logosFor(series([]), ["tmdb", "fanart", "tvdb"]);
    expect(result).toEqual({ refs: [], degraded: false });
  });

  test("skips sources the profile has no key for", async () => {
    const result = await logosFor(series(["/tmdb.png"]), ["fanart", "tvdb", "tmdb"], {});
    expect(result.refs).toEqual(["/tmdb.png"]);
    expect(requests).toEqual([]);
  });

  test("prefers the user's language, then english, then a logo without text", async () => {
    tvdbLogos = [
      { image: "https://artworks.thetvdb.com/none.png", type: 23, score: 90, language: null },
      { image: TVDB_LOGO, type: 23, score: 50, language: "eng" },
      { image: "https://artworks.thetvdb.com/fra.png", type: 23, score: 1, language: "fra" },
      { image: "https://artworks.thetvdb.com/jpn.png", type: 23, score: 99, language: "jpn" },
    ];
    const resolved = series([]);
    const fr = await logosFor(resolved, ["tvdb"], { tvdb: true }, "fr-FR");
    expect(fr.refs).toEqual([
      "https://artworks.thetvdb.com/fra.png",
      TVDB_LOGO,
      "https://artworks.thetvdb.com/none.png",
    ]);
  });
});
