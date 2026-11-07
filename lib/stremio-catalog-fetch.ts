import {
  findPolisCatalogDefinition,
  type PolisCatalogDefinition,
} from "@/lib/polis-catalogs";
import { defaultPosterQueryString, posterShapeFromQuery, type PosterShape } from "@/lib/poster-query";
import { appendTrendRankToPosterQuery } from "@/lib/poster-badges";
import { TMDB_TRENDING_TTL_SEC, tmdbTrendingUrl } from "@/lib/tmdb-trending-rank";
import { posterArtUrl } from "@/lib/polis-urls";
import {
  parseCatalogSkip,
  STREMIO_CATALOG_PAGE_SIZE,
} from "@/lib/stremio-catalog-extra";
import { isImdbId } from "@/lib/stremio-imdb-id";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import { fetchUpstream } from "@/lib/upstream-fetch";

export type StremioCatalogMeta = {
  id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
  posterShape?: PosterShape;
  releaseInfo?: string;
};

const TMDB_DISCOVER_PAGE_SIZE = 20;
const TMDB_CATALOG_PAGE_SIZE = TMDB_DISCOVER_PAGE_SIZE;
const TMDB_EXACT_SKIP_LIMIT = 200;
const TMDB_EXTERNAL_ID_CONCURRENCY = 10;
const TMDB_EXTERNAL_IDS_TTL_SEC = 30 * 24 * 60 * 60;

type TmdbTrendingRow = {
  id?: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
};

type TmdbPaged<T> = {
  results?: T[];
  page?: number;
  total_pages?: number;
};

type MdblistListRow = Record<string, unknown>;

function imdbFromMdblistRow(row: MdblistListRow): string | null {
  const ids = row.ids;
  if (ids && typeof ids === "object") {
    const imdb = (ids as { imdb?: unknown }).imdb;
    if (typeof imdb === "string" && isImdbId(imdb)) return imdb;
  }
  const direct = row.imdb_id ?? row.imdbid ?? row.imdb;
  if (typeof direct === "string" && isImdbId(direct)) return direct;
  return null;
}

function titleFromMdblistRow(row: MdblistListRow): string {
  const title = row.title ?? row.name;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Unknown";
}

function yearFromMdblistRow(row: MdblistListRow): string | undefined {
  const y = row.year ?? row.release_year;
  if (typeof y === "number" && y > 0) return String(y);
  if (typeof y === "string" && y.trim()) return y.trim().slice(0, 4);
  return undefined;
}

function mdblistRowsForCatalogType(
  payload: unknown,
  stremioType: "movie" | "series",
): MdblistListRow[] {
  if (Array.isArray(payload)) {
    return payload.filter((r): r is MdblistListRow => Boolean(r) && typeof r === "object");
  }
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const keyed = stremioType === "movie" ? record.movies : record.shows;
  if (Array.isArray(keyed)) {
    return keyed.filter((r): r is MdblistListRow => Boolean(r) && typeof r === "object");
  }
  if (Array.isArray(record.items)) {
    return record.items.filter((r): r is MdblistListRow => Boolean(r) && typeof r === "object");
  }
  return [];
}

// Upstream URLs carry api keys; keep them out of logged messages.
function errorMessageWithout(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return secret ? message.split(secret).join("[redacted]") : message;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function tmdbImdbIdForItem(params: {
  tmdbId: number;
  stremioType: "movie" | "series";
  credential: TmdbCredential;
}): Promise<string | null> {
  const kind = params.stremioType === "movie" ? "movie" : "tv";
  const url = new URL(
    `https://api.themoviedb.org/3/${kind}/${params.tmdbId}/external_ids`,
  );
  const raw = (await tmdbApiGet(url, params.credential, {
    ttlSec: TMDB_EXTERNAL_IDS_TTL_SEC,
  })) as { imdb_id?: string | null } | null;
  const imdb = raw?.imdb_id;
  return typeof imdb === "string" && isImdbId(imdb) ? imdb : null;
}

async function tmdbRowToCatalogMeta(params: {
  row: TmdbTrendingRow;
  stremioType: "movie" | "series";
  credential: TmdbCredential;
  publicBase: string;
  posterQs: string;
  trendRank?: number | null;
  configId?: string | null;
}): Promise<StremioCatalogMeta | null> {
  const tmdbId = params.row.id;
  if (typeof tmdbId !== "number") return null;

  const imdbId = await tmdbImdbIdForItem({
    tmdbId,
    stremioType: params.stremioType,
    credential: params.credential,
  });
  if (!imdbId) return null;

  const name =
    (params.stremioType === "movie" ? params.row.title : params.row.name)?.trim() || imdbId;
  const date = params.row.release_date ?? params.row.first_air_date;
  const releaseInfo = date?.slice(0, 4);

  return {
    id: imdbId,
    type: params.stremioType,
    name,
    releaseInfo: releaseInfo || undefined,
    poster: posterArtUrl({
      publicBase: params.publicBase,
      imdbId,
      query: appendTrendRankToPosterQuery(params.posterQs, params.trendRank ?? null),
      configId: params.configId,
    }),
  };
}

async function fetchTmdbCatalogMetas(params: {
  def: PolisCatalogDefinition;
  credential: TmdbCredential;
  language: string;
  publicBase: string;
  skip: number;
  posterQueryString?: string;
  configId?: string | null;
}): Promise<StremioCatalogMeta[]> {
  const { def, credential, language, publicBase, skip } = params;
  const stremioType = def.type;
  const posterQs = params.posterQueryString?.trim() || defaultPosterQueryString();
  const credentialSecret = credential.kind === "api_key" ? credential.key : credential.token;

  let path: string;
  if (def.provider.kind !== "tmdb") return [];
  if (def.provider.list === "trending") {
    path = stremioType === "movie" ? "/trending/movie/day" : "/trending/tv/day";
  } else {
    path = stremioType === "movie" ? "/movie/popular" : "/tv/popular";
  }

  const metas: StremioCatalogMeta[] = [];
  const isTrendingCatalog = def.provider.list === "trending";
  // Clients send skip as the number of titles received; TMDB repeats rows and some lack an IMDb id.
  const exactSkip = skip <= TMDB_EXACT_SKIP_LIMIT;
  let titlesToSkip = exactSkip ? skip : 0;
  let globalOffset = exactSkip ? 0 : skip;
  let tmdbPage = Math.floor(globalOffset / TMDB_DISCOVER_PAGE_SIZE) + 1;
  let offsetInPage = globalOffset % TMDB_DISCOVER_PAGE_SIZE;
  const seen = new Set<string>();

  while (metas.length < TMDB_CATALOG_PAGE_SIZE) {
    const url = isTrendingCatalog
      ? tmdbTrendingUrl(stremioType, language, tmdbPage)
      : new URL(`https://api.themoviedb.org/3${path}`);
    url.searchParams.set("language", language);
    url.searchParams.set("page", String(tmdbPage));

    const raw = (await tmdbApiGet(
      url,
      credential,
      isTrendingCatalog ? { ttlSec: TMDB_TRENDING_TTL_SEC } : {},
    )) as TmdbPaged<TmdbTrendingRow> | null;
    const rows = raw?.results ?? [];
    if (!rows.length) break;

    const slice = rows.slice(offsetInPage);
    offsetInPage = 0;

    let failedRows = 0;
    let lastRowError: unknown = null;
    const resolved = await mapWithConcurrency(
      slice.map((row, index) => ({ row, index })),
      TMDB_EXTERNAL_ID_CONCURRENCY,
      ({ row, index }) =>
        tmdbRowToCatalogMeta({
          row,
          stremioType,
          credential,
          publicBase,
          posterQs,
          trendRank: isTrendingCatalog ? globalOffset + index + 1 : null,
          configId: params.configId,
        }).catch((error: unknown) => {
          failedRows += 1;
          lastRowError = error;
          return null;
        }),
    );
    if (failedRows > 0) {
      console.warn(
        `[polis] ${failedRows} of ${slice.length} tmdb catalog rows failed for ${def.id}: ${errorMessageWithout(lastRowError, credentialSecret)}`,
      );
    }

    globalOffset += slice.length;

    for (const meta of resolved) {
      if (!meta || seen.has(meta.id)) continue;
      seen.add(meta.id);
      if (titlesToSkip > 0) {
        titlesToSkip -= 1;
        continue;
      }
      metas.push(meta);
      if (metas.length >= TMDB_CATALOG_PAGE_SIZE) break;
    }

    const totalPages = raw?.total_pages ?? tmdbPage;
    if (tmdbPage >= totalPages) break;
    if (rows.length < TMDB_DISCOVER_PAGE_SIZE) break;
    tmdbPage += 1;
  }

  return metas;
}

async function fetchMdblistCatalogMetas(params: {
  def: PolisCatalogDefinition;
  apiKey: string;
  publicBase: string;
  skip: number;
  posterQueryString?: string;
  configId?: string | null;
}): Promise<StremioCatalogMeta[]> {
  const { def, apiKey, publicBase, skip } = params;
  if (def.provider.kind !== "mdblist") return [];

  const mediaSegment = def.type === "movie" ? "movie" : "show";
  let url: URL;

  if (def.provider.list === "watchlist") {
    url = new URL(`https://api.mdblist.com/watchlist/items/${mediaSegment}`);
  } else if (def.provider.listId) {
    url = new URL(`https://api.mdblist.com/lists/${def.provider.listId}/items`);
  } else {
    return [];
  }

  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("offset", String(skip));
  url.searchParams.set("limit", String(STREMIO_CATALOG_PAGE_SIZE));

  let payload: unknown;
  try {
    const response = await fetchUpstream(url, {
      headers: { Accept: "application/json" },
      revalidateSeconds: 600,
    });
    if (!response.ok) {
      await response.body?.cancel();
      console.warn(`[polis] mdblist catalog ${def.id} returned HTTP ${response.status}`);
      return [];
    }
    payload = (await response.json()) as unknown;
  } catch (error) {
    console.warn(`[polis] mdblist catalog ${def.id} failed: ${errorMessageWithout(error, apiKey)}`);
    return [];
  }
  const rows = mdblistRowsForCatalogType(payload, def.type);

  const posterQs = params.posterQueryString?.trim() || defaultPosterQueryString();
  const metas: StremioCatalogMeta[] = [];

  for (const entry of rows) {
    if (metas.length >= STREMIO_CATALOG_PAGE_SIZE) break;
    if (!entry || typeof entry !== "object") continue;
    const row = entry as MdblistListRow;
    const imdbId = imdbFromMdblistRow(row);
    if (!imdbId) continue;

    metas.push({
      id: imdbId,
      type: def.type,
      name: titleFromMdblistRow(row),
      releaseInfo: yearFromMdblistRow(row),
      poster: posterArtUrl({ publicBase, imdbId, query: posterQs, configId: params.configId }),
    });
  }

  return metas;
}

export async function fetchPolisCatalogMetas(params: {
  type: "movie" | "series";
  catalogId: string;
  credential: TmdbCredential | null;
  mdblistApiKey: string | null;
  language: string;
  publicBase: string;
  extra: URLSearchParams;
  posterQueryString?: string;
  catalogDefinitions?: PolisCatalogDefinition[];
  configId?: string | null;
}): Promise<StremioCatalogMeta[]> {
  const def = findPolisCatalogDefinition(
    params.type,
    params.catalogId,
    params.catalogDefinitions,
  );
  if (!def) return [];

  const posterShape = posterShapeFromQuery(params.posterQueryString?.trim() || defaultPosterQueryString());
  const metas = await fetchCatalogMetasForDefinition(def, params);
  return metas.map((meta) => ({ ...meta, posterShape }));
}

async function fetchCatalogMetasForDefinition(
  def: PolisCatalogDefinition,
  params: Parameters<typeof fetchPolisCatalogMetas>[0],
): Promise<StremioCatalogMeta[]> {
  const skip = parseCatalogSkip(params.extra);

  if (def.provider.kind === "tmdb") {
    if (!params.credential) return [];
    return fetchTmdbCatalogMetas({
      def,
      credential: params.credential,
      language: params.language,
      publicBase: params.publicBase,
      skip,
      posterQueryString: params.posterQueryString,
      configId: params.configId,
    });
  }

  if (!params.mdblistApiKey) return [];
  return fetchMdblistCatalogMetas({
    def,
    apiKey: params.mdblistApiKey,
    publicBase: params.publicBase,
    skip,
    posterQueryString: params.posterQueryString,
    configId: params.configId,
  });
}
