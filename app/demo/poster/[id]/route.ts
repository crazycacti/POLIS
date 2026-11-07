import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { imageResponse } from "@/lib/cached-file-response";
import { getDemoTitle } from "@/lib/demo-catalog";
import { demoPosterHttpCacheControl } from "@/lib/poster-cache-headers";
import { posterContentType } from "@/lib/poster-output-format";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { demoRenderCacheKey, renderDemoPosterJpegCached } from "@/lib/demo-render-cache";
import { proxyClientKey } from "@/lib/client-request-context";
import { RenderLimitedError, renderAdmissionFor, renderLimitedResponseInit } from "@/lib/client-render-budget";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import {
  cachedPreviewThumb,
  DEMO_THUMB_STORE,
  isMissingFileError,
  parsePreviewWidth,
  PREVIEW_THUMB_CONTENT_TYPE,
} from "@/lib/preview-image-cache";
import { SlidingWindowLimiter } from "@/lib/sliding-window-limiter";
import { PREVIEW_WIDTH_PARAM } from "@/lib/preview-sizes";
import { stremioCorsHeaders } from "@/lib/stremio-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_THUMB_SCOPE = "demo";
const DEMO_THUMB_LOOKUP_ATTEMPTS = 2;
const DEMO_THUMB_WINDOW_MS = 60 * 1000;
const DEFAULT_DEMO_THUMB_RENDERS_PER_CLIENT_PER_MIN = 60;

type DemoThumbFailure = { retryAfterSec: number };

const demoThumbRenders = new SlidingWindowLimiter(
  DEMO_THUMB_WINDOW_MS,
  () => polisEnvPositiveInt("POLIS_DEMO_THUMB_RENDERS_PER_CLIENT_PER_MIN") ?? DEFAULT_DEMO_THUMB_RENDERS_PER_CLIENT_PER_MIN,
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: stremioCorsHeaders() });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const demoId = id.replace(/\.(jpe?g|webp)$/i, "");
  if (!getDemoTitle(demoId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const width = parsePreviewWidth(request.nextUrl.searchParams.get(PREVIEW_WIDTH_PARAM));
  if (!width.ok) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const queryString = request.nextUrl.searchParams.toString();
  const headers = (contentType: string) => ({
    "Content-Type": contentType,
    "Cache-Control": demoPosterHttpCacheControl(),
    "X-Polis-Renderer": String(POLIS_RENDERER_REVISION),
    "X-Polis-Demo": demoId,
    ...stremioCorsHeaders(),
  });

  if (width.width != null) {
    const thumbWidth = width.width;
    const clientKey = proxyClientKey(request);
    for (let attempt = 1; attempt <= DEMO_THUMB_LOOKUP_ATTEMPTS; attempt += 1) {
      const thumb = await cachedPreviewThumb<DemoThumbFailure>({
        store: DEMO_THUMB_STORE,
        scope: DEMO_THUMB_SCOPE,
        fullKey: demoRenderCacheKey(demoId, queryString),
        width: thumbWidth,
        flightTag: "demo",
        loadFull: async () => {
          if (!demoThumbRenders.take(clientKey)) {
            return { kind: "failed", failure: { retryAfterSec: demoThumbRenders.retryAfterSec(clientKey) } };
          }
          const image = await renderDemoPosterJpegCached(demoId, queryString);
          return image ? { kind: "full", image, cacheable: true } : null;
        },
      });
      if (!thumb) {
        return new NextResponse("Demo artwork missing", { status: 404 });
      }
      if (thumb.source === "failed") {
        return new NextResponse("Too many previews", {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": String(thumb.failure.retryAfterSec) },
        });
      }
      try {
        return await imageResponse(
          request,
          thumb.source === "disk" ? { path: thumb.path } : { bytes: thumb.image },
          headers(PREVIEW_THUMB_CONTENT_TYPE),
        );
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      }
    }
    return new NextResponse("Demo artwork missing", { status: 404 });
  }

  let image: Buffer | null;
  try {
    image = await renderDemoPosterJpegCached(
      demoId,
      queryString,
      renderAdmissionFor(demoThumbRenders, proxyClientKey(request)),
    );
  } catch (error) {
    if (error instanceof RenderLimitedError) {
      return new NextResponse("Too many previews", renderLimitedResponseInit(error));
    }
    throw error;
  }
  if (!image) {
    return new NextResponse("Demo artwork missing", { status: 404 });
  }

  return imageResponse(request, { bytes: image }, headers(posterContentType()));
}
