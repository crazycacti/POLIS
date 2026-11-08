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

export const TMDB_EXTRA_CATALOG_PRESETS: PolisCatalogDefinition[] = [
  { id: "tmdb-top-rated", type: "movie", name: "Top rated movies", provider: { kind: "tmdb", list: "top_rated" } },
  { id: "tmdb-top-rated", type: "series", name: "Top rated TV", provider: { kind: "tmdb", list: "top_rated" } },
  { id: "tmdb-now-playing", type: "movie", name: "In theaters", provider: { kind: "tmdb", list: "now_playing" } },
  { id: "tmdb-upcoming", type: "movie", name: "Upcoming movies", provider: { kind: "tmdb", list: "upcoming" } },
  { id: "tmdb-on-the-air", type: "series", name: "On the air", provider: { kind: "tmdb", list: "on_the_air" } },
  { id: "tmdb-airing-today", type: "series", name: "Airing today", provider: { kind: "tmdb", list: "airing_today" } },
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
