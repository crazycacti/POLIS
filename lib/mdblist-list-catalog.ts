import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";

export type MdblistListSummary = {
  id: string;
  name: string;
  mediatype: string | null;
  username: string | null;
};

export function mdblistListToCatalogDefinitions(
  list: MdblistListSummary,
): PolisCatalogDefinition[] {
  const types: ("movie" | "series")[] =
    list.mediatype === "movie"
      ? ["movie"]
      : list.mediatype === "series"
        ? ["series"]
        : ["movie", "series"];

  return types.map((type) => ({
    id: `mdblist-list-${list.id}-${type}`,
    type,
    name: list.name,
    provider: { kind: "mdblist", list: "list", listId: list.id },
  }));
}
