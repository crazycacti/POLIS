import type { TmdbCredential } from "@/lib/tmdb-server-credential";

export function inferTmdbCredentialParams(
  raw: string,
): { params: URLSearchParams | undefined; error: string | null } {
  const s = raw.trim();
  if (!s) return { params: undefined, error: null };

  const looksLikeJwt = s.includes(".");
  const useBearer = looksLikeJwt || s.length > 64;

  if (useBearer) {
    if (s.length < 30) {
      return { params: undefined, error: "Read access token too short." };
    }
    if (s.length > 1200) {
      return { params: undefined, error: "Paste only the TMDB read access token." };
    }
    const p = new URLSearchParams();
    p.set("tmdb_access_token", s);
    return { params: p, error: null };
  }

  if (s.length < 16) {
    return { params: undefined, error: "API key too short." };
  }
  if (s.length > 64) {
    return { params: undefined, error: "Paste only the v3 API key (not the read token)." };
  }
  const p = new URLSearchParams();
  p.set("api_key", s);
  return { params: p, error: null };
}

export function tmdbCredentialFromRaw(raw: string): TmdbCredential | null {
  const inferred = inferTmdbCredentialParams(raw);
  if (inferred.error || !inferred.params) return null;
  const token = inferred.params.get("tmdb_access_token");
  if (token) return { kind: "bearer", token };
  const key = inferred.params.get("api_key");
  return key ? { kind: "api_key", key } : null;
}
