import { createHash } from "node:crypto";

import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import { serializePolisCatalogDefinitions } from "@/lib/polis-catalogs-json";
import { hashPart } from "@/lib/integrator-cache-fingerprint";
import { polisCacheScope } from "@/lib/polis-cache-path";
import { readPolisDiskJson, writePolisDiskJson } from "@/lib/polis-disk-cache";
import { serveFreshOrStale } from "@/lib/polis-stale-while-revalidate";
import type { StremioCatalogMeta } from "@/lib/stremio-catalog-fetch";
import type { TmdbCredential } from "@/lib/tmdb-auth";

const STREMIO_CATALOG_CACHE_GENERATION = "2";

function metaTtlMs(): number {
  const sec = Number(process.env.POLIS_CACHE_META_TTL_SEC ?? "21600");
  return Number.isFinite(sec) && sec > 0 ? sec * 1000 : 6 * 60 * 60 * 1000;
}

function catalogTtlMs(): number {
  const sec = Number(process.env.POLIS_CACHE_CATALOG_TTL_SEC ?? "3600");
  return Number.isFinite(sec) && sec > 0 ? sec * 1000 : 60 * 60 * 1000;
}

function catalogsFingerprint(catalogs: PolisCatalogDefinition[] | undefined): string {
  if (!catalogs?.length) return "_";
  return createHash("sha256").update(serializePolisCatalogDefinitions(catalogs)).digest("hex").slice(0, 16);
}

// Responses embed request-supplied keys in art URLs and depend on the caller's watchlist,
// so entries built with one caller's credentials must never be served to another.
export function stremioCredentialFingerprint(
  credential: TmdbCredential | null | undefined,
  mdblistApiKey: string | null | undefined,
): string {
  const tmdb = !credential
    ? ""
    : credential.kind === "bearer"
      ? hashPart("tmdb_b", credential.token)
      : hashPart("tmdb_k", credential.key);
  const parts = [tmdb, hashPart("mdb", mdblistApiKey)].filter(Boolean);
  return parts.length > 0 ? parts.join("|") : "_";
}

export function stremioMetaCacheKey(params: {
  configId: string | null;
  stremioType: string;
  imdbId: string;
  language: string;
  publicBase: string;
  posterQueryString: string | undefined;
  credentialFingerprint: string;
}): string {
  const posterQs = params.posterQueryString?.trim() || "";
  return [
    String(POLIS_RENDERER_REVISION),
    "meta",
    params.configId?.trim() || "_",
    params.credentialFingerprint,
    params.publicBase,
    params.language,
    params.stremioType,
    params.imdbId,
    posterQs,
  ].join("\0");
}

export function stremioCatalogCacheKey(params: {
  configId: string | null;
  stremioType: string;
  catalogId: string;
  skip: number;
  language: string;
  publicBase: string;
  posterQueryString: string | undefined;
  catalogs: PolisCatalogDefinition[] | undefined;
  credentialFingerprint: string;
}): string {
  const posterQs = params.posterQueryString?.trim() || "";
  return [
    String(POLIS_RENDERER_REVISION),
    STREMIO_CATALOG_CACHE_GENERATION,
    "catalog",
    params.configId?.trim() || "_",
    params.credentialFingerprint,
    params.publicBase,
    params.language,
    params.stremioType,
    params.catalogId,
    String(params.skip),
    catalogsFingerprint(params.catalogs),
    posterQs,
  ].join("\0");
}

export async function readCachedStremioMeta(
  cacheKey: string,
  configId: string | null,
  options: { allowStale?: boolean } = {},
): Promise<Record<string, unknown> | null> {
  return readPolisDiskJson<Record<string, unknown>>(
    "meta",
    polisCacheScope(configId),
    cacheKey,
    options.allowStale ? undefined : metaTtlMs(),
  );
}

export async function writeCachedStremioMeta(
  cacheKey: string,
  configId: string | null,
  meta: Record<string, unknown>,
): Promise<void> {
  await writePolisDiskJson("meta", polisCacheScope(configId), cacheKey, meta);
}

export async function readCachedStremioCatalog(
  cacheKey: string,
  configId: string | null,
  options: { allowStale?: boolean } = {},
): Promise<StremioCatalogMeta[] | null> {
  const hit = await readPolisDiskJson<{ metas: StremioCatalogMeta[] }>(
    "catalog",
    polisCacheScope(configId),
    cacheKey,
    options.allowStale ? undefined : catalogTtlMs(),
  );
  return hit?.metas ?? null;
}

export async function writeCachedStremioCatalog(
  cacheKey: string,
  configId: string | null,
  metas: StremioCatalogMeta[],
): Promise<void> {
  await writePolisDiskJson("catalog", polisCacheScope(configId), cacheKey, { metas });
}

export async function getOrBuildStremioMeta(
  cacheKey: string,
  configId: string | null,
  build: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  return serveFreshOrStale({
    key: `meta:${cacheKey}`,
    label: "meta",
    readFresh: () => readCachedStremioMeta(cacheKey, configId),
    readStale: () => readCachedStremioMeta(cacheKey, configId, { allowStale: true }),
    build,
    store: (meta) => writeCachedStremioMeta(cacheKey, configId, meta),
    isStorable: (meta) => Object.keys(meta).length > 0,
  });
}

export async function getOrBuildStremioCatalog(
  cacheKey: string,
  configId: string | null,
  build: () => Promise<StremioCatalogMeta[]>,
): Promise<StremioCatalogMeta[]> {
  return serveFreshOrStale({
    key: `catalog:${cacheKey}`,
    label: "catalog",
    readFresh: () => readCachedStremioCatalog(cacheKey, configId),
    readStale: () => readCachedStremioCatalog(cacheKey, configId, { allowStale: true }),
    build,
    store: (metas) => writeCachedStremioCatalog(cacheKey, configId, metas),
    isStorable: (metas) => metas.length > 0,
  });
}
