import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getDemoTitle } from "@/lib/demo-catalog";
import { demoPosterHttpCacheControl } from "@/lib/poster-cache-headers";
import { posterContentType } from "@/lib/poster-output-format";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { renderDemoPosterJpegCached } from "@/lib/demo-render-cache";
import { stremioCorsHeaders } from "@/lib/stremio-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const queryString = request.nextUrl.searchParams.toString();
  const image = await renderDemoPosterJpegCached(demoId, queryString);
  if (!image) {
    return new NextResponse("Demo artwork missing", { status: 404 });
  }

  return new NextResponse(new Uint8Array(image), {
    headers: {
      "Content-Type": posterContentType(),
      "Cache-Control": demoPosterHttpCacheControl(),
      "X-Polis-Renderer": String(POLIS_RENDERER_REVISION),
      "X-Polis-Demo": demoId,
      ...stremioCorsHeaders(),
    },
  });
}
