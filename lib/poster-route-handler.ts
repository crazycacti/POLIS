import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { cachedFileReadableStream } from "@/lib/cached-file-response";
import { runWithClientRequestContext } from "@/lib/client-request-context";
import { getPolisConfig } from "@/lib/polis-config-store";
import { resolveFanartAuth } from "@/lib/fanart-auth";
import { resolveMdblistAuth } from "@/lib/mdblist-auth";
import { resolveTvdbAuth } from "@/lib/tvdb-auth";
import { posterContentType } from "@/lib/poster-output-format";
import { posterHttpCacheControl } from "@/lib/poster-cache-headers";
import { parsePosterOverlayQuery } from "@/lib/poster-query";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { renderPosterForImdbCached } from "@/lib/poster-render-cache";
import { resolvePolisIntegratorAuth } from "@/lib/stremio-integrator-auth";
import { resolveTmdbAuth } from "@/lib/tmdb-auth";
import { stremioCorsHeaders } from "@/lib/stremio-cors";

export async function handlePosterDefaultRequest(
  request: NextRequest,
  imdbId: string,
  configId: string | null,
): Promise<NextResponse> {
  return runWithClientRequestContext(request, () =>
    handlePosterDefaultRequestInner(request, imdbId, configId),
  );
}

async function handlePosterDefaultRequestInner(
  request: NextRequest,
  imdbId: string,
  configId: string | null,
): Promise<NextResponse> {
  if (!/^tt\d+$/.test(imdbId)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const config = configId ? getPolisConfig(configId) : null;
  if (configId && !config) {
    return new NextResponse("Not found", { status: 404 });
  }

  const integrator = resolvePolisIntegratorAuth(request, config);
  const auth = integrator.tmdb ?? resolveTmdbAuth(request);
  if (!auth) {
    return new NextResponse("Unavailable", { status: 503 });
  }

  const mdblistApiKey =
    integrator.mdblistApiKey ?? resolveMdblistAuth(request)?.apiKey ?? null;
  const fanartApiKey = resolveFanartAuth(request)?.apiKey ?? null;
  const tvdbCredentials = resolveTvdbAuth(request)?.credentials ?? null;

  const language = process.env.TMDB_LANGUAGE?.trim() || "en-US";
  const overlay = parsePosterOverlayQuery(request.nextUrl.searchParams);

  const cached = await renderPosterForImdbCached({
    imdbId,
    overlay,
    credential: auth.credential,
    language,
    mdblistApiKey,
    fanartApiKey,
    tvdbCredentials,
    configId,
  });

  if (!cached) {
    return new NextResponse("Not found", { status: 404 });
  }

  const headers = {
    "Content-Type": posterContentType(),
    "Cache-Control": posterHttpCacheControl(),
    "X-Polis-Renderer": String(POLIS_RENDERER_REVISION),
    ...stremioCorsHeaders(),
  };

  if (cached.source === "disk") {
    return new NextResponse(cachedFileReadableStream(cached.path), { headers });
  }

  return new NextResponse(new Uint8Array(cached.image), { headers });
}
