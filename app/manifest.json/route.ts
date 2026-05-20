import {
  handleStremioManifestRequest,
  stremioOptionsResponse,
} from "@/lib/stremio-handlers";
import { resolvePolisManifestKindFromEnv } from "@/lib/stremio-manifest";

export const runtime = "nodejs";

export function OPTIONS() {
  return stremioOptionsResponse();
}

export async function GET(request: Request) {
  return handleStremioManifestRequest(request, null, resolvePolisManifestKindFromEnv());
}
