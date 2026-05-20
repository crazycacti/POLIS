import { describe, expect, it } from "bun:test";

import { TMDB_CATALOG_PRESETS } from "@/lib/catalog-presets";
import {
  catalogDefinitionKey,
  moveCatalogSelection,
} from "@/lib/polis-catalogs-json";

describe("moveCatalogSelection", () => {
  const a = TMDB_CATALOG_PRESETS[0]!;
  const b = TMDB_CATALOG_PRESETS[1]!;
  const list = [a, b];

  it("moves item down", () => {
    const next = moveCatalogSelection(list, catalogDefinitionKey(a), "down");
    expect(catalogDefinitionKey(next[0]!)).toBe(catalogDefinitionKey(b));
    expect(catalogDefinitionKey(next[1]!)).toBe(catalogDefinitionKey(a));
  });

  it("no-ops at bounds", () => {
    expect(moveCatalogSelection(list, catalogDefinitionKey(a), "up")).toBe(list);
    expect(moveCatalogSelection(list, catalogDefinitionKey(b), "down")).toBe(list);
  });
});
