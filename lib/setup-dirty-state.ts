import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";

export type SetupKeyInputs = { tmdb: string; mdblist: string };

export type SetupKeyChanges = { tmdb: boolean; mdblist: boolean };

export const NO_KEY_CHANGES: SetupKeyChanges = { tmdb: false, mdblist: false };

function keyInputChanged(current: string, sent: string): boolean {
  const trimmed = current.trim();
  return trimmed !== "" && trimmed !== sent.trim();
}

export function setupKeyChanges(current: SetupKeyInputs, sent: SetupKeyInputs): SetupKeyChanges {
  return {
    tmdb: keyInputChanged(current.tmdb, sent.tmdb),
    mdblist: keyInputChanged(current.mdblist, sent.mdblist),
  };
}

export function setupSnapshot(
  posterQuery: string,
  catalogs: readonly PolisCatalogDefinition[],
  keyChanges: SetupKeyChanges = NO_KEY_CHANGES,
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
    [keyChanges.tmdb, keyChanges.mdblist],
  ]);
}

export function hasUnsavedSetupChanges(saved: string | null, current: string): boolean {
  return saved !== null && saved !== current;
}
