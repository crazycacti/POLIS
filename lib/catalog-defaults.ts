import {
  MDBLIST_WATCHLIST_PRESETS,
  TMDB_CATALOG_PRESETS,
} from "@/lib/catalog-presets";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import { mergeCatalogSelections } from "@/lib/polis-catalogs-json";

export function defaultCatalogsForCredentials(
  hasTmdb: boolean,
  hasMdblist: boolean,
): PolisCatalogDefinition[] {
  const add: PolisCatalogDefinition[] = [];
  if (hasTmdb) add.push(...TMDB_CATALOG_PRESETS);
  if (hasMdblist) add.push(...MDBLIST_WATCHLIST_PRESETS);
  return mergeCatalogSelections([], add);
}
