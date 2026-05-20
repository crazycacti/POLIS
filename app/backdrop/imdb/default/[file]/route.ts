import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleBackdropRequest } from "@/lib/artwork-route-handler";
import { stremioCorsHeaders } from "@/lib/stremio-cors";

export const runtime = "nodejs";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: stremioCorsHeaders() });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const imdbId = file.replace(/\.jpe?g$/i, "");
  return handleBackdropRequest(request, imdbId, null);
}
