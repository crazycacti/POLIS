import { describe, expect, it } from "bun:test";

import { fetchPolisCatalogMetas } from "@/lib/stremio-catalog-fetch";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";

describe("fetchMdblistCatalogMetas", () => {
  it("returns metas for public list when MDBLIST_API_KEY is set", async () => {
    const apiKey = process.env.MDBLIST_API_KEY?.trim();
    if (!apiKey) return;

    const def: PolisCatalogDefinition = {
      id: "mdblist-list-161766-movie",
      type: "movie",
      name: "Today's Most Popular Movies",
      provider: { kind: "mdblist", list: "list", listId: "161766" },
    };

    const metas = await fetchPolisCatalogMetas({
      type: "movie",
      catalogId: def.id,
      credential: null,
      mdblistApiKey: apiKey,
      language: "en-US",
      publicBase: "http://localhost:3050/test",
      extra: new URLSearchParams(),
      catalogDefinitions: [def],
    });

    expect(metas.length).toBeGreaterThan(0);
    expect(metas[0]?.id.startsWith("tt")).toBe(true);
  });
});
