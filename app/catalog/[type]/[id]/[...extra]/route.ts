import type { NextRequest } from "next/server";

import {
  handleStremioCatalogRequest,
  stremioOptionsResponse,
} from "@/lib/stremio-handlers";

export const runtime = "nodejs";

export function OPTIONS() {
  return stremioOptionsResponse();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string; extra: string[] }> },
) {
  const { type, id, extra } = await params;
  return handleStremioCatalogRequest(request, null, type, id, extra);
}
