import { describe, expect, it } from "bun:test";

import { CATALOG_NAME_MAX_LENGTH, toStremioManifestCatalog } from "@/lib/polis-catalogs";
import {
  catalogDefinitionKey,
  moveCatalogSelectionToEdge,
  parsePolisCatalogDefinition,
  updateCatalogSelection,
} from "@/lib/polis-catalogs-json";
import { fetchPolisCatalogMetas } from "@/lib/stremio-catalog-fetch";

const tmdb = (type: string, list: string, extra: Record<string, unknown> = {}) => ({
  id: `tmdb-${list}`,
  type,
  name: "Row",
  provider: { kind: "tmdb", list },
  ...extra,
});

describe("catalog definitions", () => {
  it("accepts TMDB lists that exist for the type and rejects the rest", () => {
    expect(parsePolisCatalogDefinition(tmdb("movie", "now_playing"))?.provider).toEqual({ kind: "tmdb", list: "now_playing" });
    expect(parsePolisCatalogDefinition(tmdb("series", "airing_today"))).not.toBeNull();
    expect(parsePolisCatalogDefinition(tmdb("movie", "airing_today"))).toBeNull();
    expect(parsePolisCatalogDefinition(tmdb("series", "upcoming"))).toBeNull();
    expect(parsePolisCatalogDefinition(tmdb("movie", "../trending"))).toBeNull();
  });

  it("trims, collapses and caps names", () => {
    const def = parsePolisCatalogDefinition({ ...tmdb("movie", "popular"), name: `  My   ${"x".repeat(100)}` });
    expect(def?.name.startsWith("My x")).toBe(true);
    expect(def!.name.length).toBeLessThanOrEqual(CATALOG_NAME_MAX_LENGTH);
  });

  it("keeps the Home switch only when it is off", () => {
    expect(parsePolisCatalogDefinition(tmdb("movie", "popular", { home: false }))?.home).toBe(false);
    expect("home" in parsePolisCatalogDefinition(tmdb("movie", "popular", { home: true }))!).toBe(false);
  });

  it("makes Discover-only rows need a genre with one option", () => {
    const def = parsePolisCatalogDefinition(tmdb("movie", "popular", { home: false }))!;
    const manifest = toStremioManifestCatalog(def);
    expect(manifest.extra[0]).toEqual({ name: "genre", isRequired: true, options: ["All"] });
    const home = toStremioManifestCatalog(parsePolisCatalogDefinition(tmdb("movie", "popular"))!);
    expect(home.extra.every((e) => !e.isRequired)).toBe(true);
  });
});

describe("TMDB list paths", () => {
  it("asks TMDB for the list the row names", async () => {
    const def = parsePolisCatalogDefinition(tmdb("series", "on_the_air"))!;
    const realFetch = globalThis.fetch;
    const paths: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      paths.push(new URL(input instanceof Request ? input.url : String(input)).pathname);
      return Response.json({ page: 1, total_pages: 1, results: [] });
    }) as typeof fetch;
    try {
      await fetchPolisCatalogMetas({
        type: "series",
        catalogId: def.id,
        credential: { kind: "api_key", key: "catalog-path-test-key" },
        mdblistApiKey: null,
        language: "en-US",
        publicBase: "http://localhost:3050",
        extra: new URLSearchParams("genre=All"),
        catalogDefinitions: [def],
      });
      expect(paths[0]).toBe("/3/tv/on_the_air");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("catalog list edits", () => {
  const rows = ["popular", "top_rated", "upcoming"].map((list) => parsePolisCatalogDefinition(tmdb("movie", list))!);
  const keyOf = (i: number) => catalogDefinitionKey(rows[i]!);

  it("moves a row to the top or bottom", () => {
    expect(moveCatalogSelectionToEdge(rows, keyOf(2), "top").map((r) => r.id)).toEqual(["tmdb-upcoming", "tmdb-popular", "tmdb-top_rated"]);
    expect(moveCatalogSelectionToEdge(rows, keyOf(0), "bottom").map((r) => r.id)).toEqual(["tmdb-top_rated", "tmdb-upcoming", "tmdb-popular"]);
  });

  it("renames, keeps the old name when blank, and toggles Home", () => {
    const renamed = updateCatalogSelection(rows, keyOf(0), { name: "  Big   hits " });
    expect(renamed[0]!.name).toBe("Big hits");
    expect(updateCatalogSelection(rows, keyOf(0), { name: "   " })[0]!.name).toBe("Row");
    const off = updateCatalogSelection(rows, keyOf(1), { home: false });
    expect(off[1]!.home).toBe(false);
    expect("home" in updateCatalogSelection(off, keyOf(1), { home: true })[1]!).toBe(false);
  });
});
