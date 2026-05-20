import { TMDB_CATALOG_PRESETS } from "@/lib/catalog-presets";
import { parsePolisCatalogDefinition } from "@/lib/polis-catalogs-json";

export type PolisCatalogProvider =
  | { kind: "tmdb"; list: "trending" | "popular" }
  | { kind: "mdblist"; list: "watchlist" | "list"; listId?: string };

export type PolisCatalogDefinition = {
  id: string;
  type: "movie" | "series";
  name: string;
  provider: PolisCatalogProvider;
};

function parseMdblistCatalogEntry(raw: string): PolisCatalogDefinition | null {
  const parts = raw.split(":").map((p) => p.trim());
  if (parts.length < 3) return null;

  const [listKey, typeRaw, ...nameParts] = parts;
  const name = nameParts.join(":").trim();
  if (!name) return null;
  if (typeRaw !== "movie" && typeRaw !== "series") return null;

  if (listKey === "watchlist") {
    return {
      id: `mdblist-watchlist-${typeRaw}`,
      type: typeRaw,
      name,
      provider: { kind: "mdblist", list: "watchlist" },
    };
  }

  if (!/^\d+$/.test(listKey)) return null;
  return {
    id: `mdblist-list-${listKey}-${typeRaw}`,
    type: typeRaw,
    name,
    provider: { kind: "mdblist", list: "list", listId: listKey },
  };
}

export function polisCatalogsEnabled(): boolean {
  const flag = process.env.POLIS_ENABLE_CATALOGS?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  return Boolean(
    process.env.TMDB_ACCESS_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim(),
  );
}

export function listPolisCatalogDefinitions(): PolisCatalogDefinition[] {
  if (!polisCatalogsEnabled()) return [];

  const raw = process.env.POLIS_CATALOGS?.trim();
  if (raw === "none" || raw === "off") return [];

  const out: PolisCatalogDefinition[] = [];
  const seen = new Set<string>();

  const push = (def: PolisCatalogDefinition) => {
    const key = `${def.type}:${def.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(def);
  };

  if (raw && raw !== "default") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          const def = parsePolisCatalogDefinition(row);
          if (def) push(def);
        }
        if (out.length > 0) return out;
      }
    } catch {}
  }

  for (const def of TMDB_CATALOG_PRESETS) {
    push(def);
  }

  const mdblistLists = process.env.POLIS_MDBLIST_LISTS?.trim();
  if (mdblistLists) {
    for (const entry of mdblistLists.split(",")) {
      const def = parseMdblistCatalogEntry(entry);
      if (def) push(def);
    }
  } else if (process.env.POLIS_MDBLIST_WATCHLIST?.trim() === "1" && process.env.MDBLIST_API_KEY?.trim()) {
    push({
      id: "mdblist-watchlist-movie",
      type: "movie",
      name: "MDBList watchlist",
      provider: { kind: "mdblist", list: "watchlist" },
    });
    push({
      id: "mdblist-watchlist-series",
      type: "series",
      name: "MDBList watchlist",
      provider: { kind: "mdblist", list: "watchlist" },
    });
  }

  return out;
}

export function findPolisCatalogDefinition(
  type: "movie" | "series",
  catalogId: string,
  definitions?: PolisCatalogDefinition[],
): PolisCatalogDefinition | undefined {
  const list = definitions ?? listPolisCatalogDefinitions();
  return list.find((c) => c.type === type && c.id === catalogId);
}

export type StremioManifestCatalog = {
  type: string;
  id: string;
  name: string;
  extra: { name: string; isRequired: boolean; options?: string[] }[];
  extraSupported?: string[];
  showInHome?: boolean;
};

export function toStremioManifestCatalog(def: PolisCatalogDefinition): StremioManifestCatalog {
  return {
    type: def.type,
    id: def.id,
    name: def.name,
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"],
    showInHome: true,
  };
}
