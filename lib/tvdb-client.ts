import { fetchUpstream } from "@/lib/upstream-fetch";
import type { TvdbCredentials } from "@/lib/tvdb-credentials";

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

export async function tvdbLogin(credentials: TvdbCredentials): Promise<string | null> {
  const now = Date.now();
  const cacheKey = tvdbLoginCacheKey(credentials);
  if (cachedToken && cachedToken.cacheKey === cacheKey && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const body: { apikey: string; pin?: string } = { apikey: credentials.apiKey };
  if (credentials.pin) {
    body.pin = credentials.pin;
  }

  const response = await fetchUpstream("https://api.thetvdb.com/v4/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 3600 },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as TvdbLoginResponse;
  const token = payload.data?.token?.trim();
  if (!token) return null;

  cachedToken = { cacheKey, token, expiresAt: now + 23 * 3600 * 1000 };
  return token;
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

  const url = new URL(`https://api.thetvdb.com/v4/series/${params.tvdbId}/artworks`);
  url.searchParams.set("lang", params.language.split("-")[0] ?? "en");

  const response = await fetchUpstream(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    revalidateSeconds: 86400,
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as TvdbArtworksResponse;
  return pickTvdbPosterUrl(payload.data ?? [], params.language, params.preferTextless);
}
