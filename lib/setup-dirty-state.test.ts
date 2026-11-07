import { describe, expect, it } from "bun:test";

import { MDBLIST_WATCHLIST_PRESETS, TMDB_CATALOG_PRESETS } from "@/lib/catalog-presets";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import { hasUnsavedSetupChanges, setupSnapshot } from "@/lib/setup-dirty-state";

describe("setupSnapshot", () => {
  const a = TMDB_CATALOG_PRESETS[0]!;
  const b = MDBLIST_WATCHLIST_PRESETS[1]!;

  it("matches for equal content with different key order", () => {
    const reordered: PolisCatalogDefinition = {
      provider: { list: "trending", kind: "tmdb" },
      name: a.name,
      type: a.type,
      id: a.id,
    };
    expect(setupSnapshot("rating=1", [reordered])).toBe(setupSnapshot("rating=1", [a]));
  });

  it("changes when catalog order changes", () => {
    expect(setupSnapshot("", [a, b])).not.toBe(setupSnapshot("", [b, a]));
  });

  it("changes when the poster query changes", () => {
    expect(setupSnapshot("rating=1", [a])).not.toBe(setupSnapshot("rating=0", [a]));
  });

  it("distinguishes mdblist list ids", () => {
    const list = (listId: string): PolisCatalogDefinition => ({
      id: "mdblist-list-movie",
      type: "movie",
      name: "List",
      provider: { kind: "mdblist", list: "list", listId },
    });
    expect(setupSnapshot("", [list("1")])).not.toBe(setupSnapshot("", [list("2")]));
  });
});

describe("hasUnsavedSetupChanges", () => {
  it("is false before a baseline exists", () => {
    expect(hasUnsavedSetupChanges(null, setupSnapshot("", []))).toBe(false);
  });

  it("compares against the baseline", () => {
    const base = setupSnapshot("x=1", []);
    expect(hasUnsavedSetupChanges(base, base)).toBe(false);
    expect(hasUnsavedSetupChanges(base, setupSnapshot("x=2", []))).toBe(true);
  });
});
