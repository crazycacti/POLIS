import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { handleLogoRequest } from "@/lib/artwork-route-handler";
import { isValidPolisConfigId } from "@/lib/polis-config-id";
import { stremioCorsHeaders } from "@/lib/stremio-cors";

export const runtime = "nodejs";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: stremioCorsHeaders() });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string; file: string }> },
) {
  const { configId, file } = await params;
  if (!isValidPolisConfigId(configId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const imdbId = file.replace(/\.png$/i, "");
  return handleLogoRequest(request, imdbId, configId);
}
