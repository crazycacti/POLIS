import type { NextRequest } from "next/server";

import {
  handleStremioMetaRequest,
  stremioOptionsResponse,
} from "@/lib/stremio-handlers";

export const runtime = "nodejs";

export function OPTIONS() {
  return stremioOptionsResponse();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  return handleStremioMetaRequest(request, null, type, id);
}
