import type { PolisCatalogDefinition, PolisCatalogProvider } from "@/lib/polis-catalogs";

function parseProvider(raw: Record<string, unknown>): PolisCatalogProvider | null {
  if (raw.kind === "tmdb" && (raw.list === "trending" || raw.list === "popular")) {
    return { kind: "tmdb", list: raw.list };
  }
  if (raw.kind === "mdblist" && raw.list === "watchlist") {
    return { kind: "mdblist", list: "watchlist" };
  }
  if (raw.kind === "mdblist" && raw.list === "list" && typeof raw.listId === "string") {
    const listId = raw.listId.trim();
    if (!listId) return null;
    return { kind: "mdblist", list: "list", listId };
  }
  return null;
}

export function parsePolisCatalogDefinition(row: unknown): PolisCatalogDefinition | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const type =
    record.type === "series" ? "series" : record.type === "movie" ? "movie" : null;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const provider =
    record.provider && typeof record.provider === "object"
      ? parseProvider(record.provider as Record<string, unknown>)
      : null;
  if (!id || !type || !name || !provider) return null;
  return { id, type, name, provider };
}

export function parsePolisCatalogDefinitionsFromJson(raw: string | null | undefined): PolisCatalogDefinition[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: PolisCatalogDefinition[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      const def = parsePolisCatalogDefinition(row);
      if (!def) continue;
      const key = `${def.type}:${def.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(def);
    }
    return out;
  } catch {
    return [];
  }
}

export function serializePolisCatalogDefinitions(defs: PolisCatalogDefinition[]): string {
  return JSON.stringify(defs);
}

export function catalogDefinitionKey(def: PolisCatalogDefinition): string {
  return `${def.type}:${def.id}`;
}

export function mergeCatalogSelections(
  current: PolisCatalogDefinition[],
  add: PolisCatalogDefinition[],
): PolisCatalogDefinition[] {
  const seen = new Set(current.map(catalogDefinitionKey));
  const out = [...current];
  for (const def of add) {
    const key = catalogDefinitionKey(def);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(def);
  }
  return out;
}

export function removeCatalogSelection(
  current: PolisCatalogDefinition[],
  key: string,
): PolisCatalogDefinition[] {
  return current.filter((c) => catalogDefinitionKey(c) !== key);
}

export function moveCatalogSelection(
  current: PolisCatalogDefinition[],
  key: string,
  direction: "up" | "down",
): PolisCatalogDefinition[] {
  const index = current.findIndex((c) => catalogDefinitionKey(c) === key);
  if (index < 0) return current;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= current.length) return current;
  const next = [...current];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
