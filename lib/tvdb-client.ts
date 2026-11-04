import type { ArtworkCandidate } from "@/lib/artwork-candidate";
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
  data?: { artworks?: TvdbArtworkRecord[] | null } | TvdbArtworkRecord[] | null;
};

const TVDB_POSTER_ARTWORK_TYPE = 2;
const TVDB_TOKEN_CACHE_MAX = 16;

// TVDB tags artwork with ISO 639-2 codes, not the ISO 639-1 codes TMDB uses.
const TVDB_LANGUAGE_CODES: Record<string, string> = {
  ar: "ara", cs: "ces", da: "dan", de: "deu", el: "ell", en: "eng", es: "spa", fi: "fin",
  fr: "fra", he: "heb", hi: "hin", hu: "hun", id: "ind", it: "ita", ja: "jpn", ko: "kor",
  nl: "nld", no: "nor", pl: "pol", pt: "por", ro: "ron", ru: "rus", sv: "swe", th: "tha",
  tr: "tur", uk: "ukr", vi: "vie", zh: "zho",
};

export function tvdbLanguageCode(language: string): string | null {
  const primary = language.split("-")[0]?.trim().toLowerCase() ?? "";
  if (primary.length === 3) return primary;
  return TVDB_LANGUAGE_CODES[primary] ?? null;
}

export function tvdbArtworkRecords(payload: TvdbArtworksResponse | null): TvdbArtworkRecord[] {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  const artworks = data?.artworks;
  return Array.isArray(artworks) ? artworks : [];
}

const cachedTokens = new Map<string, { token: string; expiresAt: number }>();

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
  const cachedToken = cachedTokens.get(cacheKey);
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
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
      cache: "no-store",
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

  cachedTokens.delete(cacheKey);
  cachedTokens.set(cacheKey, { token, expiresAt: now + 23 * 3600 * 1000 });
  if (cachedTokens.size > TVDB_TOKEN_CACHE_MAX) {
    const oldest = cachedTokens.keys().next().value;
    if (oldest !== undefined) cachedTokens.delete(oldest);
  }
  return { ok: true, token };
}

export async function tvdbLogin(credentials: TvdbCredentials): Promise<string | null> {
  const result = await tvdbLoginResult(credentials);
  return result.ok ? result.token : null;
}

type TvdbArtworkRecordWithText = TvdbArtworkRecord & { includesText?: boolean };

export function pickTvdbPoster(
  records: TvdbArtworkRecordWithText[],
  language: string,
  preferTextless = false,
): ArtworkCandidate | null {
  const lang = tvdbLanguageCode(language);
  const posters = records.filter(
    (r) => r.type === TVDB_POSTER_ARTWORK_TYPE && (r.image || r.thumbnail),
  );
  if (!posters.length) return null;

  const pool =
    preferTextless && posters.some((r) => r.includesText === false)
      ? posters.filter((r) => r.includesText === false)
      : posters;

  const scoreOf = (r: TvdbArtworkRecordWithText): number =>
    (r.score ?? 0) + (lang && r.language === lang ? 1000 : 0);

  pool.sort((a, b) => scoreOf(b) - scoreOf(a));
  const best = pool[0];
  const url = best?.image ?? best?.thumbnail;
  return url ? { url, textless: best?.includesText === false } : null;
}

export async function fetchTvdbSeriesPoster(params: {
  tvdbId: number;
  credentials: TvdbCredentials;
  language: string;
  preferTextless?: boolean;
}): Promise<ArtworkCandidate | null> {
  const token = await tvdbLogin(params.credentials);
  if (!token) return null;

  const url = new URL(`${TVDB_V4_API_BASE}/series/${params.tvdbId}/artworks`);
  url.searchParams.set("type", String(TVDB_POSTER_ARTWORK_TYPE));

  const response = await fetchUpstream(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    revalidateSeconds: 86400,
  });
  if (response.status === 401) cachedTokens.delete(tvdbLoginCacheKey(params.credentials));
  if (!response.ok) return null;

  let payload: TvdbArtworksResponse;
  try {
    payload = (await response.json()) as TvdbArtworksResponse;
  } catch {
    return null;
  }
  return pickTvdbPoster(tvdbArtworkRecords(payload), params.language, params.preferTextless);
}
