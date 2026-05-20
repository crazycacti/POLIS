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

function resolveTvdbFromRaw(raw: string, explicitPin?: string): TvdbCredentials | null {
  const parsed = parseTvdbCredentials(raw);
  if (!parsed) return null;
  if (!parsed.pin && explicitPin?.trim()) {
    return { apiKey: parsed.apiKey, pin: explicitPin.trim() };
  }
  return parsed;
}

export function resolveTvdbAuth(request: NextRequest): ResolvedTvdbAuth | null {
  const q = request.nextUrl.searchParams;
  const fromQuery = q.get("tvdb_api_key")?.trim();
  const queryPin = q.get("tvdb_pin")?.trim();
  if (fromQuery) {
    const credentials = resolveTvdbFromRaw(fromQuery, queryPin);
    if (credentials) {
      return { credentials, embedInArtworkUrls: true };
    }
  }

  const envKey = process.env.TVDB_API_KEY?.trim();
  if (envKey) {
    const credentials = resolveTvdbFromRaw(envKey, process.env.TVDB_PIN?.trim());
    if (credentials) {
      return { credentials, embedInArtworkUrls: false };
    }
  }

  return null;
}

export function resolveTvdbApiKeyFromRequest(request: NextRequest): string | null {
  return resolveTvdbAuth(request)?.credentials.apiKey ?? null;
}
