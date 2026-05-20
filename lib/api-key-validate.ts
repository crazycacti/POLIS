import { fetchUpstream } from "@/lib/upstream-fetch";
import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tvdbLoginResult } from "@/lib/tvdb-client";
import { parseTvdbCredentials } from "@/lib/tvdb-credentials";

export type ApiKeyProvider = "tmdb" | "mdblist" | "fanart" | "tvdb";

export type ApiKeyValidateResult = {
  ok: boolean;
  message: string;
};

function tmdbCredentialFromRaw(raw: string): TmdbCredential | null {
  const inferred = inferTmdbCredentialParams(raw);
  if (inferred.error || !inferred.params) return null;
  const token = inferred.params.get("tmdb_access_token");
  if (token) return { kind: "bearer", token };
  const key = inferred.params.get("api_key");
  if (key) return { kind: "api_key", key };
  return null;
}

export async function validateTmdbKey(raw: string): Promise<ApiKeyValidateResult> {
  const inferred = inferTmdbCredentialParams(raw);
  if (inferred.error) {
    return { ok: false, message: inferred.error };
  }
  const credential = tmdbCredentialFromRaw(raw);
  if (!credential) {
    return { ok: false, message: "Enter a TMDB API key or read access token." };
  }

  const url = new URL("https://api.themoviedb.org/3/configuration");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (credential.kind === "api_key") {
    url.searchParams.set("api_key", credential.key);
  } else {
    headers.Authorization = `Bearer ${credential.token}`;
  }

  try {
    const response = await fetchUpstream(url, { headers, timeoutMs: 10_000 });
    if (response.ok) {
      return { ok: true, message: "TMDB key is valid." };
    }
    if (response.status === 401) {
      return { ok: false, message: "TMDB rejected this key (401)." };
    }
    return { ok: false, message: `TMDB returned ${response.status}.` };
  } catch {
    return { ok: false, message: "Could not reach TMDB. Try again." };
  }
}

export async function validateMdblistKey(raw: string): Promise<ApiKeyValidateResult> {
  const key = raw.trim();
  if (key.length < 8) {
    return { ok: false, message: "MDBList API key too short." };
  }

  const url = new URL("https://api.mdblist.com/lists/user");
  url.searchParams.set("apikey", key);

  try {
    const response = await fetchUpstream(url, {
      headers: { Accept: "application/json" },
      timeoutMs: 10_000,
    });
    if (response.ok) {
      return { ok: true, message: "MDBList key is valid." };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "MDBList rejected this key." };
    }
    return { ok: false, message: `MDBList returned ${response.status}.` };
  } catch {
    return { ok: false, message: "Could not reach MDBList. Try again." };
  }
}

export async function validateFanartKey(raw: string): Promise<ApiKeyValidateResult> {
  const key = raw.trim();
  if (key.length < 8) {
    return { ok: false, message: "Fanart API key too short." };
  }

  const url = `https://webservice.fanart.tv/v3/movies/603?api_key=${encodeURIComponent(key)}`;

  try {
    const response = await fetchUpstream(url, {
      headers: { Accept: "application/json" },
      timeoutMs: 10_000,
    });
    if (response.ok) {
      return { ok: true, message: "Fanart.tv key is valid." };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "Fanart.tv rejected this key." };
    }
    return { ok: false, message: `Fanart.tv returned ${response.status}.` };
  } catch {
    return { ok: false, message: "Could not reach Fanart.tv. Try again." };
  }
}

export async function validateTvdbKey(raw: string): Promise<ApiKeyValidateResult> {
  const credentials = parseTvdbCredentials(raw);
  if (!credentials) {
    return {
      ok: false,
      message: "Enter your TheTVDB API key (8+ characters).",
    };
  }

  const result = await tvdbLoginResult(credentials);
  if (result.ok) {
    return { ok: true, message: "TheTVDB key is valid." };
  }

  if (result.message === "network") {
    return { ok: false, message: "Could not reach TheTVDB. Try again." };
  }

  return { ok: false, message: "TheTVDB rejected this API key." };
}

export async function validateApiKey(
  provider: ApiKeyProvider,
  raw: string,
): Promise<ApiKeyValidateResult> {
  switch (provider) {
    case "tmdb":
      return validateTmdbKey(raw);
    case "mdblist":
      return validateMdblistKey(raw);
    case "fanart":
      return validateFanartKey(raw);
    case "tvdb":
      return validateTvdbKey(raw);
  }
}
