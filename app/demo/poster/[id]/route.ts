import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { imageResponse } from "@/lib/cached-file-response";
import { getDemoTitle } from "@/lib/demo-catalog";
import { demoPosterHttpCacheControl } from "@/lib/poster-cache-headers";
import { posterContentType } from "@/lib/poster-output-format";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { demoRenderCacheKey, renderDemoPosterJpegCached } from "@/lib/demo-render-cache";
import { cachedPreviewThumb, parsePreviewWidth, PREVIEW_THUMB_CONTENT_TYPE } from "@/lib/preview-image-cache";
import { PREVIEW_WIDTH_PARAM } from "@/lib/preview-sizes";
import { stremioCorsHeaders } from "@/lib/stremio-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_THUMB_SCOPE = "demo";

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
    const thumb = await cachedPreviewThumb({
      scope: DEMO_THUMB_SCOPE,
      fullKey: demoRenderCacheKey(demoId, queryString),
      width: width.width,
      loadFull: async () => {
        const image = await renderDemoPosterJpegCached(demoId, queryString);
        return image ? { image, cacheable: true } : null;
      },
    });
    if (!thumb) {
      return new NextResponse("Demo artwork missing", { status: 404 });
    }
    return imageResponse(
      request,
      thumb.source === "disk" ? { path: thumb.path } : { bytes: thumb.image },
      headers(PREVIEW_THUMB_CONTENT_TYPE),
    );
  }

  const image = await renderDemoPosterJpegCached(demoId, queryString);
  if (!image) {
    return new NextResponse("Demo artwork missing", { status: 404 });
  }

  return imageResponse(request, { bytes: image }, headers(posterContentType()));
}
