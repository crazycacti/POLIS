import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";

export function setupSnapshot(
  posterQuery: string,
  catalogs: readonly PolisCatalogDefinition[],
): string {
  return JSON.stringify([
    posterQuery,
    catalogs.map((c) => [
      c.type,
      c.id,
      c.name,
      c.provider.kind,
      c.provider.list,
      c.provider.kind === "mdblist" ? (c.provider.listId ?? null) : null,
    ]),
  ]);
}

export function hasUnsavedSetupChanges(saved: string | null, current: string): boolean {
  return saved !== null && saved !== current;
}
