import type { NextRequest } from "next/server";

import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";
import type { StoredPolisConfig } from "@/lib/polis-config-store";
import {
  resolveTmdbAuth,
  tmdbAuthToSearchParams,
  type ResolvedTmdbAuth,
  type TmdbCredential,
} from "@/lib/tmdb-auth";

export type ResolvedPolisIntegratorAuth = {
  tmdb: ResolvedTmdbAuth | null;
  mdblistApiKey: string | null;
};

function tmdbFromIntegratorSecret(raw: string | null | undefined): ResolvedTmdbAuth | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const inferred = inferTmdbCredentialParams(trimmed);
  if (!inferred.params) return null;

  const token = inferred.params.get("tmdb_access_token");
  if (token) {
    return {
      credential: { kind: "bearer", token },
      embedInArtworkUrls: true,
    };
  }

  const key = inferred.params.get("api_key");
  if (key) {
    return {
      credential: { kind: "api_key", key },
      embedInArtworkUrls: true,
    };
  }

  return null;
}

function mdblistFromRequest(request: NextRequest): string | null {
  const q = request.nextUrl.searchParams;
  return (
    q.get("mdblist_api_key")?.trim() ||
    q.get("mdblist_key")?.trim() ||
    process.env.MDBLIST_API_KEY?.trim() ||
    null
  );
}

export function resolvePolisIntegratorAuth(
  request: NextRequest,
  config: StoredPolisConfig | null,
): ResolvedPolisIntegratorAuth {
  const fromRequest = resolveTmdbAuth(request);
  const fromConfig = config ? tmdbFromIntegratorSecret(config.tmdbIntegratorSecret) : null;
  const tmdb = fromRequest ?? fromConfig;

  const mdblistFromQuery = mdblistFromRequest(request);
  const mdblistFromConfig = config?.mdblistIntegratorKey?.trim() || null;

  return {
    tmdb,
    mdblistApiKey: mdblistFromQuery || mdblistFromConfig,
  };
}

export function artworkAuthParamsForPolis(
  auth: ResolvedPolisIntegratorAuth,
): URLSearchParams | undefined {
  if (!auth.tmdb?.embedInArtworkUrls) return undefined;
  return tmdbAuthToSearchParams(auth.tmdb.credential);
}

export function tmdbCredentialFromIntegratorSecret(
  raw: string | null | undefined,
): TmdbCredential | null {
  const resolved = tmdbFromIntegratorSecret(raw);
  return resolved?.credential ?? null;
}
