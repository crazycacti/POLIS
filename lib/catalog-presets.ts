import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";

export const TMDB_CATALOG_PRESETS: PolisCatalogDefinition[] = [
  {
    id: "tmdb-trending",
    type: "movie",
    name: "Trending movies",
    provider: { kind: "tmdb", list: "trending" },
  },
  {
    id: "tmdb-trending",
    type: "series",
    name: "Trending TV",
    provider: { kind: "tmdb", list: "trending" },
  },
  {
    id: "tmdb-popular",
    type: "movie",
    name: "Popular movies",
    provider: { kind: "tmdb", list: "popular" },
  },
  {
    id: "tmdb-popular",
    type: "series",
    name: "Popular TV",
    provider: { kind: "tmdb", list: "popular" },
  },
];

export const MDBLIST_WATCHLIST_PRESETS: PolisCatalogDefinition[] = [
  {
    id: "mdblist-watchlist-movie",
    type: "movie",
    name: "MDBList watchlist",
    provider: { kind: "mdblist", list: "watchlist" },
  },
  {
    id: "mdblist-watchlist-series",
    type: "series",
    name: "MDBList watchlist",
    provider: { kind: "mdblist", list: "watchlist" },
  },
];
