import { describe, expect, it } from "bun:test";

import { fetchPolisCatalogMetas } from "@/lib/stremio-catalog-fetch";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";

describe("fetchMdblistCatalogMetas", () => {
  it("returns metas for public list when MDBLIST_API_KEY is set", async () => {
    const apiKey = process.env.MDBLIST_API_KEY?.trim();
    if (!apiKey) return;

    // Hard-coded list ids get deleted upstream; pick a current public movie list instead.
    const topUrl = new URL("https://api.mdblist.com/lists/top");
    topUrl.searchParams.set("apikey", apiKey);
    const top = (await (await fetch(topUrl)).json()) as { id?: number; mediatype?: string; items?: number }[];
    const list = top.find((row) => row.mediatype === "movie" && (row.items ?? 0) > 0);
    expect(list?.id).toBeDefined();

    const def: PolisCatalogDefinition = {
      id: `mdblist-list-${list!.id}-movie`,
      type: "movie",
      name: "Top list",
      provider: { kind: "mdblist", list: "list", listId: String(list!.id) },
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
