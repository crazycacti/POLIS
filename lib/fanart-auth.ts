import type { NextRequest } from "next/server";

export type ResolvedFanartAuth = {
  apiKey: string;
  embedInArtworkUrls: boolean;
};

export function fanartAuthToSearchParams(apiKey: string): URLSearchParams {
  const p = new URLSearchParams();
  p.set("fanart_api_key", apiKey);
  return p;
}

export function resolveFanartAuth(request: NextRequest): ResolvedFanartAuth | null {
  const q = request.nextUrl.searchParams;
  const fromQuery = q.get("fanart_api_key")?.trim();
  if (fromQuery) {
    return { apiKey: fromQuery, embedInArtworkUrls: true };
  }

  const envKey = process.env.FANART_API_KEY?.trim();
  if (envKey) {
    return { apiKey: envKey, embedInArtworkUrls: false };
  }

  return null;
}

export function resolveFanartApiKeyFromRequest(request: NextRequest): string | null {
  return resolveFanartAuth(request)?.apiKey ?? null;
}
