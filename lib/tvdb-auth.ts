import type { NextRequest } from "next/server";

import {
  formatTvdbCredentials,
  parseTvdbCredentials,
  type TvdbCredentials,
} from "@/lib/tvdb-credentials";

export type ResolvedTvdbAuth = {
  credentials: TvdbCredentials;
  embedInArtworkUrls: boolean;
};

export function tvdbAuthToSearchParams(credentials: TvdbCredentials): URLSearchParams {
  const p = new URLSearchParams();
  p.set("tvdb_api_key", formatTvdbCredentials(credentials));
  return p;
}

export function resolveTvdbAuth(request: NextRequest): ResolvedTvdbAuth | null {
  const q = request.nextUrl.searchParams;
  const fromQuery = q.get("tvdb_api_key")?.trim();
  if (fromQuery) {
    const credentials = parseTvdbCredentials(fromQuery);
    if (credentials) {
      return { credentials, embedInArtworkUrls: true };
    }
  }

  const envKey = process.env.TVDB_API_KEY?.trim();
  if (envKey) {
    const credentials = parseTvdbCredentials(envKey);
    if (credentials) {
      return { credentials, embedInArtworkUrls: false };
    }
  }

  return null;
}

export function resolveTvdbApiKeyFromRequest(request: NextRequest): string | null {
  return resolveTvdbAuth(request)?.credentials.apiKey ?? null;
}
