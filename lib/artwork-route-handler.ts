import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { cachedFileReadableStream } from "@/lib/cached-file-response";
import { runWithClientRequestContext } from "@/lib/client-request-context";
import { getPolisConfig } from "@/lib/polis-config-store";
import {
  renderBackdropJpegCached,
  renderLogoPngCached,
  resolveCachedBackdropDiskPath,
  resolveCachedLogoDiskPath,
} from "@/lib/artwork-render-cache";
import { resolvePolisIntegratorAuth } from "@/lib/stremio-integrator-auth";
import { resolveTmdbAuth } from "@/lib/tmdb-auth";
import { stremioCorsHeaders } from "@/lib/stremio-cors";
import { resolveTitleForArtwork } from "@/lib/tmdb-resolve";

export async function handleBackdropRequest(
  request: NextRequest,
  imdbId: string,
  configId: string | null,
): Promise<NextResponse> {
  return runWithClientRequestContext(request, () =>
    handleBackdropRequestInner(request, imdbId, configId),
  );
}

async function handleBackdropRequestInner(
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

  const language = process.env.TMDB_LANGUAGE?.trim() || "en-US";

  const cachedBackdropPath = await resolveCachedBackdropDiskPath(imdbId, language, configId);
  if (cachedBackdropPath) {
    return new NextResponse(cachedFileReadableStream(cachedBackdropPath), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        ...stremioCorsHeaders(),
      },
    });
  }

  const resolved = await resolveTitleForArtwork(imdbId, auth.credential, language);
  if (!resolved?.backdropPath) {
    return new NextResponse("Not found", { status: 404 });
  }

  const jpeg = await renderBackdropJpegCached(
    resolved.backdropPath,
    imdbId,
    language,
    configId,
  );
  if (!jpeg) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
      ...stremioCorsHeaders(),
    },
  });
}

export async function handleLogoRequest(
  request: NextRequest,
  imdbId: string,
  configId: string | null,
): Promise<NextResponse> {
  return runWithClientRequestContext(request, () =>
    handleLogoRequestInner(request, imdbId, configId),
  );
}

async function handleLogoRequestInner(
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

  const language = process.env.TMDB_LANGUAGE?.trim() || "en-US";

  const cachedLogoPath = await resolveCachedLogoDiskPath(imdbId, language, configId);
  if (cachedLogoPath) {
    return new NextResponse(cachedFileReadableStream(cachedLogoPath), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
        ...stremioCorsHeaders(),
      },
    });
  }

  const resolved = await resolveTitleForArtwork(imdbId, auth.credential, language);
  if (!resolved?.logoPath) {
    return new NextResponse("Not found", { status: 404 });
  }

  const png = await renderLogoPngCached(resolved.logoPath, imdbId, language, configId);
  if (!png) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      ...stremioCorsHeaders(),
    },
  });
}
