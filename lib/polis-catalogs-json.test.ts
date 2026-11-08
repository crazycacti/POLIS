import { describe, expect, it } from "bun:test";

import { TMDB_CATALOG_PRESETS } from "@/lib/catalog-presets";
import {
  catalogDefinitionKey,
  moveCatalogSelection,
  parsePolisCatalogDefinition,
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

describe("parsePolisCatalogDefinition mdblist list ids", () => {
  const row = (listId: string) => ({
    id: "mdblist-list-x-movie",
    type: "movie",
    name: "List",
    provider: { kind: "mdblist", list: "list", listId },
  });

  it("keeps numeric list ids", () => {
    expect(parsePolisCatalogDefinition(row("12345"))?.provider).toEqual({
      kind: "mdblist",
      list: "list",
      listId: "12345",
    });
  });

  it("drops list ids that are not numeric", () => {
    expect(parsePolisCatalogDefinition(row("../../watchlist/items/movie?x="))).toBeNull();
    expect(parsePolisCatalogDefinition(row("12%2F34"))).toBeNull();
  });
});
