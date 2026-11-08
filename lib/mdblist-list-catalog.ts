import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";

export type MdblistListSummary = {
  id: string;
  name: string;
  mediatype: string | null;
  username: string | null;
  items: number | null;
  likes: number | null;
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

export type MdblistAuthor = { username: string; likes: number };

export function popularMdblistAuthors(lists: MdblistListSummary[], limit: number): MdblistAuthor[] {
  const likes = new Map<string, number>();
  for (const list of lists) {
    if (!list.username) continue;
    likes.set(list.username, (likes.get(list.username) ?? 0) + (list.likes ?? 0));
  }
  return [...likes]
    .map(([username, total]) => ({ username, likes: total }))
    .sort((a, b) => b.likes - a.likes || a.username.localeCompare(b.username))
    .slice(0, limit);
}
