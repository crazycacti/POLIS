import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleLogoRequest } from "@/lib/artwork-route-handler";
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
  const imdbId = file.replace(/\.png$/i, "");
  return handleLogoRequest(request, imdbId, null);
}
