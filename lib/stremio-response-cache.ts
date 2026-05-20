import { createHash } from "node:crypto";

import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import { serializePolisCatalogDefinitions } from "@/lib/polis-catalogs-json";
import { polisCacheScope } from "@/lib/polis-cache-path";
import { readPolisDiskJson, writePolisDiskJson } from "@/lib/polis-disk-cache";
import { polisSingleflight } from "@/lib/polis-singleflight";
import type { StremioCatalogMeta } from "@/lib/stremio-catalog-fetch";

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

export function stremioMetaCacheKey(params: {
  configId: string | null;
  stremioType: string;
  imdbId: string;
  language: string;
  publicBase: string;
  posterQueryString: string | undefined;
}): string {
  const posterQs = params.posterQueryString?.trim() || "";
  return [
    String(POLIS_RENDERER_REVISION),
    "meta",
    params.configId?.trim() || "_",
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
}): string {
  const posterQs = params.posterQueryString?.trim() || "";
  return [
    String(POLIS_RENDERER_REVISION),
    STREMIO_CATALOG_CACHE_GENERATION,
    "catalog",
    params.configId?.trim() || "_",
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
): Promise<Record<string, unknown> | null> {
  return readPolisDiskJson<Record<string, unknown>>(
    "meta",
    polisCacheScope(configId),
    cacheKey,
    metaTtlMs(),
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
): Promise<StremioCatalogMeta[] | null> {
  const hit = await readPolisDiskJson<{ metas: StremioCatalogMeta[] }>(
    "catalog",
    polisCacheScope(configId),
    cacheKey,
    catalogTtlMs(),
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
  const cached = await readCachedStremioMeta(cacheKey, configId);
  if (cached) return cached;

  return polisSingleflight(`meta:${cacheKey}`, async () => {
    const raced = await readCachedStremioMeta(cacheKey, configId);
    if (raced) return raced;

    const meta = await build();
    void writeCachedStremioMeta(cacheKey, configId, meta).catch(() => {});
    return meta;
  });
}

export async function getOrBuildStremioCatalog(
  cacheKey: string,
  configId: string | null,
  build: () => Promise<StremioCatalogMeta[]>,
): Promise<StremioCatalogMeta[]> {
  const cached = await readCachedStremioCatalog(cacheKey, configId);
  if (cached) return cached;

  return polisSingleflight(`catalog:${cacheKey}`, async () => {
    const raced = await readCachedStremioCatalog(cacheKey, configId);
    if (raced) return raced;

    const metas = await build();
    if (metas.length > 0) {
      void writeCachedStremioCatalog(cacheKey, configId, metas).catch(() => {});
    }
    return metas;
  });
}
