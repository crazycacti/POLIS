import { fetchUpstream } from "@/lib/upstream-fetch";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

export const TVDB_V4_API_BASE = "https://api4.thetvdb.com/v4";

type TvdbLoginResponse = {
  data?: { token?: string };
};

type TvdbArtworkRecord = {
  image?: string;
  thumbnail?: string;
  type?: number;
  score?: number;
  language?: string | null;
};

type TvdbArtworksResponse = {
  data?: TvdbArtworkRecord[];
};

let cachedToken: { cacheKey: string; token: string; expiresAt: number } | null = null;

function tvdbLoginCacheKey(credentials: TvdbCredentials): string {
  return `${credentials.apiKey}\0${credentials.pin ?? ""}`;
}

export type TvdbLoginResult =
  | { ok: true; token: string }
  | { ok: false; status: number; message: string };

function tvdbLoginFailureMessage(status: number, bodyText: string): string {
  const lower = bodyText.toLowerCase();
  if (status === 400 && lower.includes("pin")) {
    return "pin_required";
  }
  if (status === 401) {
    return "unauthorized";
  }
  return `http_${status}`;
}

export async function tvdbLoginResult(credentials: TvdbCredentials): Promise<TvdbLoginResult> {
  const now = Date.now();
  const cacheKey = tvdbLoginCacheKey(credentials);
  if (cachedToken && cachedToken.cacheKey === cacheKey && cachedToken.expiresAt > now + 60_000) {
    return { ok: true, token: cachedToken.token };
  }

  const body: { apikey: string; pin?: string } = { apikey: credentials.apiKey };
  if (credentials.pin) {
    body.pin = credentials.pin;
  }

  let response: Response;
  try {
    response = await fetchUpstream(`${TVDB_V4_API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 3600 },
    });
  } catch {
    return { ok: false, status: 0, message: "network" };
  }

  const bodyText = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: tvdbLoginFailureMessage(response.status, bodyText),
    };
  }

  let payload: TvdbLoginResponse;
  try {
    payload = JSON.parse(bodyText) as TvdbLoginResponse;
  } catch {
    return { ok: false, status: response.status, message: "invalid_json" };
  }

  const token = payload.data?.token?.trim();
  if (!token) {
    return { ok: false, status: response.status, message: "no_token" };
  }

  cachedToken = { cacheKey, token, expiresAt: now + 23 * 3600 * 1000 };
  return { ok: true, token };
}

export async function tvdbLogin(credentials: TvdbCredentials): Promise<string | null> {
  const result = await tvdbLoginResult(credentials);
  return result.ok ? result.token : null;
}

type TvdbArtworkRecordWithText = TvdbArtworkRecord & { includesText?: boolean };

function pickTvdbPosterUrl(
  records: TvdbArtworkRecordWithText[],
  language: string,
  preferTextless = false,
): string | null {
  const lang = language.split("-")[0]?.toLowerCase() ?? "en";
  const posters = records.filter((r) => r.type === 2 && (r.image || r.thumbnail));
  if (!posters.length) return null;

  const pool =
    preferTextless && posters.some((r) => r.includesText === false)
      ? posters.filter((r) => r.includesText === false)
      : posters;

  const scoreOf = (r: TvdbArtworkRecordWithText): number =>
    (r.score ?? 0) + (r.language === lang ? 1000 : 0);

  pool.sort((a, b) => scoreOf(b) - scoreOf(a));
  const best = pool[0];
  return best?.image ?? best?.thumbnail ?? null;
}

export async function fetchTvdbSeriesPosterUrl(params: {
  tvdbId: number;
  credentials: TvdbCredentials;
  language: string;
  preferTextless?: boolean;
}): Promise<string | null> {
  const token = await tvdbLogin(params.credentials);
  if (!token) return null;

  const url = new URL(`${TVDB_V4_API_BASE}/series/${params.tvdbId}/artworks`);
  url.searchParams.set("lang", params.language.split("-")[0] ?? "en");

  const response = await fetchUpstream(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    revalidateSeconds: 86400,
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as TvdbArtworksResponse;
  return pickTvdbPosterUrl(payload.data ?? [], params.language, params.preferTextless);
}
