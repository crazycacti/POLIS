import {
  handleStremioManifestRequest,
  stremioOptionsResponse,
} from "@/lib/stremio-handlers";

export const runtime = "nodejs";

export function OPTIONS() {
  return stremioOptionsResponse();
}

export async function GET(request: Request) {
  return handleStremioManifestRequest(request, null, "full");
}
