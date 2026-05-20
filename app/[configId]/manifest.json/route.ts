import {
  handleStremioManifestRequest,
  stremioOptionsResponse,
} from "@/lib/stremio-handlers";
import { isValidPolisConfigId } from "@/lib/polis-config-id";

export const runtime = "nodejs";

export function OPTIONS() {
  return stremioOptionsResponse();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ configId: string }> },
) {
  const { configId } = await params;
  if (!isValidPolisConfigId(configId)) {
    return new Response(JSON.stringify({ error: "Invalid config id" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handleStremioManifestRequest(request, configId, "meta");
}
