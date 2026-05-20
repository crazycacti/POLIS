import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { runWithClientRequestContext } from "@/lib/client-request-context";
import { getPolisConfig } from "@/lib/polis-config-store";
import { polisPublicBaseFromRequest } from "@/lib/public-base";
import { buildStremioMetaRecord } from "@/lib/stremio-meta-build";
import { fetchPolisCatalogMetas } from "@/lib/stremio-catalog-fetch";
import { parseCatalogSkip, parseStremioCatalogExtra } from "@/lib/stremio-catalog-extra";
import {
  getOrBuildStremioCatalog,
  getOrBuildStremioMeta,
  stremioCatalogCacheKey,
  stremioMetaCacheKey,
} from "@/lib/stremio-response-cache";
import {
  artworkAuthParamsForPolis,
  resolvePolisIntegratorAuth,
} from "@/lib/stremio-integrator-auth";
import { buildPolisManifest, type PolisManifestKind } from "@/lib/stremio-manifest";
import { stremioCorsHeaders } from "@/lib/stremio-cors";
import { isImdbId, normalizeMetaPathId } from "@/lib/stremio-imdb-id";
import { resolveTitleFromImdb } from "@/lib/tmdb-resolve";

function jsonResponse(body: unknown, cacheSeconds: number, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...stremioCorsHeaders(),
      "Cache-Control": `public, max-age=${cacheSeconds}`,
    },
  });
}

export function stremioOptionsResponse() {
  return new NextResponse(null, { status: 204, headers: stremioCorsHeaders() });
}

export async function handleStremioManifestRequest(
  request: Request,
  configId: string | null,
  kind: PolisManifestKind,
) {
  const base = polisPublicBaseFromRequest(request);

  if (configId) {
    const config = getPolisConfig(configId);
    if (!config) {
      return jsonResponse({ error: "Unknown POLIS config id" }, 60, 404);
    }
    const manifestKind: PolisManifestKind =
      config.catalogs.length > 0 ? "full" : kind === "full" ? "full" : config.manifestKind;
    return jsonResponse(
      buildPolisManifest(base, manifestKind, {
        configId: config.id,
        catalogs: config.catalogs,
        label: config.label,
      }),
      300,
    );
  }

  return jsonResponse(buildPolisManifest(base, kind), 300);
}

export async function handleStremioMetaRequest(
  request: NextRequest,
  configId: string | null,
  rawType: string,
  rawId: string,
) {
  return runWithClientRequestContext(request, () =>
    handleStremioMetaRequestInner(request, configId, rawType, rawId),
  );
}

async function handleStremioMetaRequestInner(
  request: NextRequest,
  configId: string | null,
  rawType: string,
  rawId: string,
) {
  const id = normalizeMetaPathId(rawId);

  if (!isImdbId(id) || (rawType !== "movie" && rawType !== "series")) {
    return jsonResponse({ meta: {} }, 60);
  }

  const config = configId ? getPolisConfig(configId) : null;
  if (configId && !config) {
    return jsonResponse({ meta: {} }, 60, 404);
  }

  const integrator = resolvePolisIntegratorAuth(request, config);
  if (!integrator.tmdb) {
    return jsonResponse({ meta: {} }, 60);
  }

  const language = process.env.TMDB_LANGUAGE?.trim() || "en-US";
  const stremioType = rawType === "movie" ? "movie" : "series";
  const publicBase = polisPublicBaseFromRequest(request);
  const useConfigScopedArt = Boolean(config?.id);
  const artworkAuth = useConfigScopedArt ? undefined : artworkAuthParamsForPolis(integrator);
  const posterQuery = config?.posterQuery;

  const metaCacheKey = stremioMetaCacheKey({
    configId: config?.id ?? null,
    stremioType: rawType,
    imdbId: id,
    language,
    publicBase,
    posterQueryString: posterQuery,
  });

  const meta = await getOrBuildStremioMeta(metaCacheKey, config?.id ?? null, async () => {
    const resolved = await resolveTitleFromImdb({
      imdbId: id,
      stremioType,
      credential: integrator.tmdb!.credential,
      language,
    });
    if (!resolved) return {};
    return buildStremioMetaRecord(resolved, publicBase, artworkAuth, posterQuery, config?.id);
  });

  return jsonResponse({ meta }, 300);
}

export async function handleStremioCatalogRequest(
  request: NextRequest,
  configId: string | null,
  rawType: string,
  rawId: string,
  extraPathSegments?: string[],
) {
  return runWithClientRequestContext(request, () =>
    handleStremioCatalogRequestInner(request, configId, rawType, rawId, extraPathSegments),
  );
}

async function handleStremioCatalogRequestInner(
  request: NextRequest,
  configId: string | null,
  rawType: string,
  rawId: string,
  extraPathSegments?: string[],
) {
  const catalogId = normalizeMetaPathId(rawId);

  if (rawType !== "movie" && rawType !== "series") {
    return jsonResponse({ metas: [] }, 60);
  }

  const config = configId ? getPolisConfig(configId) : null;
  if (configId && !config) {
    return jsonResponse({ metas: [] }, 60, 404);
  }

  const integrator = resolvePolisIntegratorAuth(request, config);
  const extra = parseStremioCatalogExtra(extraPathSegments, request.nextUrl.searchParams);
  const skip = parseCatalogSkip(extra);
  const language = process.env.TMDB_LANGUAGE?.trim() || "en-US";
  const publicBase = polisPublicBaseFromRequest(request);

  const catalogCacheKey = stremioCatalogCacheKey({
    configId: config?.id ?? null,
    stremioType: rawType,
    catalogId,
    skip,
    language,
    publicBase,
    posterQueryString: config?.posterQuery,
    catalogs: config?.catalogs,
  });
  const metas = await getOrBuildStremioCatalog(catalogCacheKey, config?.id ?? null, () =>
    fetchPolisCatalogMetas({
      type: rawType,
      catalogId,
      credential: integrator.tmdb?.credential ?? null,
      mdblistApiKey: integrator.mdblistApiKey,
      language,
      publicBase,
      extra,
      posterQueryString: config?.posterQuery,
      catalogDefinitions: config?.catalogs,
      configId: config?.id,
    }),
  );

  return jsonResponse({ metas }, 300);
}
