import type { NextRequest } from "next/server";

import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";
import type { StoredPolisConfig } from "@/lib/polis-config-store";
import { ANONYMOUS_UPSTREAM_PROFILE, type UpstreamKeySource } from "@/lib/upstream-guard";
import {
  resolveTmdbAuth,
  tmdbAuthToSearchParams,
  type ResolvedTmdbAuth,
  type TmdbCredential,
} from "@/lib/tmdb-auth";

export type ResolvedPolisIntegratorAuth = {
  tmdb: ResolvedTmdbAuth | null;
  mdblistApiKey: string | null;
  mdblistKeySource: UpstreamKeySource | null;
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

type MdblistKeyChoice = { apiKey: string; source: UpstreamKeySource };

function mdblistFromRequest(request: NextRequest): MdblistKeyChoice | null {
  const q = request.nextUrl.searchParams;
  const fromQuery = q.get("mdblist_api_key")?.trim() || q.get("mdblist_key")?.trim();
  if (fromQuery) return { apiKey: fromQuery, source: "request" };
  const fromServer = process.env.MDBLIST_API_KEY?.trim();
  return fromServer ? { apiKey: fromServer, source: "server" } : null;
}

export function resolvePolisIntegratorAuth(
  request: NextRequest,
  config: StoredPolisConfig | null,
): ResolvedPolisIntegratorAuth {
  const fromRequest = resolveTmdbAuth(request);
  const fromConfig = config ? tmdbFromIntegratorSecret(config.tmdbIntegratorSecret) : null;
  const tmdb = fromRequest ?? fromConfig;

  const mdblistFromConfig = config?.mdblistIntegratorKey?.trim() || null;
  const mdblist: MdblistKeyChoice | null =
    mdblistFromRequest(request) ??
    (mdblistFromConfig ? { apiKey: mdblistFromConfig, source: "profile" } : null);

  return {
    tmdb,
    mdblistApiKey: mdblist?.apiKey ?? null,
    mdblistKeySource: mdblist?.source ?? null,
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

export function serverKeyProfileFor(
  source: UpstreamKeySource | null,
  configId: string | null,
): string | null {
  if (source !== "server") return null;
  return configId?.trim() || ANONYMOUS_UPSTREAM_PROFILE;
}
