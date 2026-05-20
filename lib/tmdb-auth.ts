import type { NextRequest } from "next/server";

import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";

export type TmdbCredential =
  | { kind: "bearer"; token: string }
  | { kind: "api_key"; key: string };

export type ResolvedTmdbAuth = {
  credential: TmdbCredential;
  embedInArtworkUrls: boolean;
};

export function tmdbAuthToSearchParams(credential: TmdbCredential): URLSearchParams {
  const p = new URLSearchParams();
  if (credential.kind === "bearer") {
    p.set("tmdb_access_token", credential.token);
  } else {
    p.set("api_key", credential.key);
  }
  return p;
}

export function mergePosterQueryWithAuth(
  posterQueryString: string,
  authParams: URLSearchParams | undefined,
): string {
  const merged = new URLSearchParams(posterQueryString);
  if (authParams) {
    authParams.forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return merged.toString();
}

export function resolveTmdbAuth(request: NextRequest): ResolvedTmdbAuth | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) {
      return {
        credential: { kind: "bearer", token },
        embedInArtworkUrls: true,
      };
    }
  }

  const q = request.nextUrl.searchParams;
  const tmdbKey = q.get("tmdb_key")?.trim();
  if (tmdbKey) {
    const inferred = inferTmdbCredentialParams(tmdbKey);
    if (inferred.params) {
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
    }
  }

  const apiKey = q.get("api_key")?.trim();
  if (apiKey) {
    return {
      credential: { kind: "api_key", key: apiKey },
      embedInArtworkUrls: true,
    };
  }

  const accessToken = q.get("tmdb_access_token")?.trim();
  if (accessToken) {
    return {
      credential: { kind: "bearer", token: accessToken },
      embedInArtworkUrls: true,
    };
  }

  const envApiKey = process.env.TMDB_API_KEY?.trim();
  const envBearer = process.env.TMDB_ACCESS_TOKEN?.trim();

  if (envApiKey && envBearer) {
    return {
      credential: { kind: "api_key", key: envApiKey },
      embedInArtworkUrls: false,
    };
  }

  if (envBearer) {
    return {
      credential: { kind: "bearer", token: envBearer },
      embedInArtworkUrls: false,
    };
  }

  if (envApiKey) {
    return {
      credential: { kind: "api_key", key: envApiKey },
      embedInArtworkUrls: false,
    };
  }

  return null;
}
