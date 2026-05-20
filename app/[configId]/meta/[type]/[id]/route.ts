import type { NextRequest } from "next/server";

import { isValidPolisConfigId } from "@/lib/polis-config-id";
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
  { params }: { params: Promise<{ configId: string; type: string; id: string }> },
) {
  const { configId, type, id } = await params;
  if (!isValidPolisConfigId(configId)) {
    return new Response(JSON.stringify({ error: "Invalid config id" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handleStremioMetaRequest(request, configId, type, id);
}
