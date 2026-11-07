import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { imageResponse } from "@/lib/cached-file-response";
import { proxyClientKey } from "@/lib/client-request-context";
import { CREDENTIAL_QUERY_KEYS } from "@/lib/demo-poster-query";
import { previewPosterHttpCacheControl } from "@/lib/poster-cache-headers";
import { parsePosterOverlayQuery } from "@/lib/poster-query";
import { DEGRADED_POSTER_TTL_SEC } from "@/lib/poster-render-cache";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { isMissingFileError, parsePreviewWidth } from "@/lib/preview-image-cache";
import { parsePreviewKeysCookie, PREVIEW_KEYS_COOKIE } from "@/lib/preview-keys";
import { previewPoster, resolvePreviewAuth } from "@/lib/preview-poster";
import { PREVIEW_WIDTH_PARAM } from "@/lib/preview-sizes";
import { isImdbId } from "@/lib/stremio-imdb-id";

const PREVIEW_FILE_SUFFIX = ".webp";
const PREVIEW_QUERY_MAX_CHARS = 2048;
const PREVIEW_LOOKUP_ATTEMPTS = 2;
const NO_STORE = { "Cache-Control": "no-store" };

function plain(status: number, body: string, headers: Record<string, string> = {}): NextResponse {
  return new NextResponse(body, { status, headers: { ...NO_STORE, ...headers } });
}

export async function handlePreviewPosterRequest(request: NextRequest, file: string): Promise<NextResponse> {
  if (!file.endsWith(PREVIEW_FILE_SUFFIX)) return plain(404, "Not found");
  const imdbId = file.slice(0, -PREVIEW_FILE_SUFFIX.length);
  if (!isImdbId(imdbId)) return plain(400, "Bad request");
  if (request.nextUrl.search.length > PREVIEW_QUERY_MAX_CHARS) return plain(400, "Bad request");

  const searchParams = request.nextUrl.searchParams;
  // Keys travel only in the path-scoped cookie so they never land in URLs, access logs or HTTP caches.
  if (CREDENTIAL_QUERY_KEYS.some((key) => searchParams.has(key))) return plain(400, "Bad request");
  const width = parsePreviewWidth(searchParams.get(PREVIEW_WIDTH_PARAM));
  if (!width.ok) return plain(400, "Bad request");

  const auth = resolvePreviewAuth(parsePreviewKeysCookie(request.cookies.get(PREVIEW_KEYS_COOKIE)?.value));
  const language = process.env.TMDB_LANGUAGE?.trim() || "en-US";

  const previewRequest = {
    imdbId,
    overlay: parsePosterOverlayQuery(searchParams),
    width: width.width,
    auth,
    language,
    clientKey: proxyClientKey(request),
  };

  for (let attempt = 1; ; attempt += 1) {
    let result;
    try {
      result = await previewPoster(previewRequest);
    } catch (error) {
      console.warn(`[polis] preview render failed for ${imdbId}`, error);
      return plain(502, "Preview unavailable");
    }

    if (result.kind === "uncached" || result.kind === "not_found") return plain(404, "Not found");
    if (result.kind === "limited") {
      return plain(429, "Too many previews", { "Retry-After": String(result.retryAfterSec) });
    }

    const headers = {
      "Content-Type": result.contentType,
      "Cache-Control": previewPosterHttpCacheControl(result.degraded ? DEGRADED_POSTER_TTL_SEC : undefined),
      "X-Polis-Renderer": String(POLIS_RENDERER_REVISION),
    };
    try {
      return await imageResponse(
        request,
        result.image.source === "disk" ? { path: result.image.path } : { bytes: result.image.image },
        headers,
      );
    } catch (error) {
      // The cache trim can remove a file between lookup and open; look it up again once.
      if (!isMissingFileError(error)) throw error;
      if (attempt >= PREVIEW_LOOKUP_ATTEMPTS) return plain(404, "Not found");
    }
  }
}
