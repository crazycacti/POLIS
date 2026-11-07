import type { ArtworkCandidate } from "@/lib/artwork-candidate";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { fetchUpstream } from "@/lib/upstream-fetch";
import { upstreamCredentialFingerprint, upstreamGuard } from "@/lib/upstream-guard";
import { cachedUpstreamJson, upstreamNextRevalidateSeconds } from "@/lib/upstream-json-cache";
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

const LOGIN_FAILURE_TTL_MS = 15 * 60 * 1000;
const LOGIN_TRANSIENT_FAILURE_TTL_MS = 60 * 1000;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const HTTP_TOO_MANY_REQUESTS = 429;

type TvdbLoginFailure = Extract<TvdbLoginResult, { ok: false }>;

const loginFailures = new Map<string, { result: TvdbLoginFailure; until: number }>();

function rememberLoginFailure(cacheKey: string, result: TvdbLoginFailure, ttlMs: number): TvdbLoginFailure {
  loginFailures.delete(cacheKey);
  loginFailures.set(cacheKey, { result, until: Date.now() + ttlMs });
  if (loginFailures.size > TVDB_TOKEN_CACHE_MAX) {
    const oldest = loginFailures.keys().next().value;
    if (oldest !== undefined) loginFailures.delete(oldest);
  }
  return result;
}

export async function tvdbLoginResult(credentials: TvdbCredentials): Promise<TvdbLoginResult> {
  const now = Date.now();
  const cacheKey = tvdbLoginCacheKey(credentials);
  const cachedToken = cachedTokens.get(cacheKey);
  if (cachedToken && cachedToken.expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
    return { ok: true, token: cachedToken.token };
  }
  const failure = loginFailures.get(cacheKey);
  if (failure && failure.until > now) return failure.result;

  return polisSingleflight(`tvdb-login:${upstreamCredentialFingerprint(cacheKey)}`, () =>
    tvdbLoginFresh(credentials, cacheKey),
  );
}

async function tvdbLoginFresh(credentials: TvdbCredentials, cacheKey: string): Promise<TvdbLoginResult> {
  const scope = {
    provider: "tvdb" as const,
    credentialFingerprint: upstreamCredentialFingerprint(credentials.apiKey),
    authFailureCooldown: false,
  };
  if (upstreamGuard.inCooldown(scope.provider, scope.credentialFingerprint)) {
    return { ok: false, status: HTTP_TOO_MANY_REQUESTS, message: "rate_limited" };
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
    return rememberLoginFailure(cacheKey, { ok: false, status: 0, message: "network" }, LOGIN_TRANSIENT_FAILURE_TTL_MS);
  }
  upstreamGuard.observe(scope, response);

  const bodyText = await response.text();
  if (!response.ok) {
    const result: TvdbLoginFailure = {
      ok: false,
      status: response.status,
      message: tvdbLoginFailureMessage(response.status, bodyText),
    };
    if (response.status === HTTP_TOO_MANY_REQUESTS) return result;
    const ttlMs = response.status >= 500 ? LOGIN_TRANSIENT_FAILURE_TTL_MS : LOGIN_FAILURE_TTL_MS;
    return rememberLoginFailure(cacheKey, result, ttlMs);
  }

  let payload: TvdbLoginResponse;
  try {
    payload = JSON.parse(bodyText) as TvdbLoginResponse;
  } catch {
    return rememberLoginFailure(
      cacheKey,
      { ok: false, status: response.status, message: "invalid_json" },
      LOGIN_TRANSIENT_FAILURE_TTL_MS,
    );
  }

  const token = payload.data?.token?.trim();
  if (!token) {
    return rememberLoginFailure(
      cacheKey,
      { ok: false, status: response.status, message: "no_token" },
      LOGIN_TRANSIENT_FAILURE_TTL_MS,
    );
  }

  loginFailures.delete(cacheKey);
  cachedTokens.delete(cacheKey);
  cachedTokens.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
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

const DAY_MS = 24 * 60 * 60 * 1000;
const TVDB_ARTWORK_TTL_MS = 7 * DAY_MS;
const TVDB_ARTWORK_MISSING_TTL_MS = DAY_MS;

function parseTvdbArtworks(payload: unknown): TvdbArtworkRecordWithText[] | null {
  if (!payload || typeof payload !== "object") return null;
  return tvdbArtworkRecords(payload as TvdbArtworksResponse).flatMap((row): TvdbArtworkRecordWithText[] => {
    if (!row || typeof row !== "object") return [];
    const r = row as TvdbArtworkRecordWithText;
    return [{
      image: typeof r.image === "string" ? r.image : undefined,
      thumbnail: typeof r.thumbnail === "string" ? r.thumbnail : undefined,
      type: typeof r.type === "number" ? r.type : undefined,
      score: typeof r.score === "number" ? r.score : undefined,
      language: typeof r.language === "string" ? r.language : null,
      includesText: typeof r.includesText === "boolean" ? r.includesText : undefined,
    }];
  });
}

export async function fetchTvdbSeriesPoster(params: {
  tvdbId: number;
  credentials: TvdbCredentials;
  language: string;
  preferTextless?: boolean;
}): Promise<ArtworkCandidate | null> {
  const url = new URL(`${TVDB_V4_API_BASE}/series/${params.tvdbId}/artworks`);
  url.searchParams.set("type", String(TVDB_POSTER_ARTWORK_TYPE));

  const result = await cachedUpstreamJson<TvdbArtworkRecordWithText[]>({
    provider: "tvdb",
    cacheKey: ["series-artworks", TVDB_POSTER_ARTWORK_TYPE, params.tvdbId].join("\0"),
    ttlMs: TVDB_ARTWORK_TTL_MS,
    negativeTtlMs: TVDB_ARTWORK_MISSING_TTL_MS,
    label: `series ${params.tvdbId}`,
    credentialFingerprint: upstreamCredentialFingerprint(params.credentials.apiKey),
    authFailureCooldown: false,
    request: async () => {
      const login = await tvdbLoginResult(params.credentials);
      if (!login.ok) throw new Error(`TVDB login failed: ${login.message}`);
      const response = await fetchUpstream(url, {
        headers: { Authorization: `Bearer ${login.token}`, Accept: "application/json" },
        revalidateSeconds: upstreamNextRevalidateSeconds(TVDB_ARTWORK_TTL_MS),
      });
      if (response.status === 401) cachedTokens.delete(tvdbLoginCacheKey(params.credentials));
      return response;
    },
    parse: parseTvdbArtworks,
  });
  return pickTvdbPoster(result.value ?? [], params.language, params.preferTextless);
}
