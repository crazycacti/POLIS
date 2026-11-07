type FanartAsset = {
  url?: string;
  lang?: string;
  iso_639_1?: string | null;
};

import type { ArtworkCandidate, ArtworkLookup } from "@/lib/artwork-candidate";
import { fetchUpstream } from "@/lib/upstream-fetch";
import { upstreamCredentialFingerprint } from "@/lib/upstream-guard";
import { cachedUpstreamJson, upstreamNextRevalidateSeconds } from "@/lib/upstream-json-cache";
import { rankTitleLogos, type TitleLogoEntry } from "@/lib/title-logo-rank";

function isTextlessFanartAsset(asset: FanartAsset): boolean {
  const code = (asset.lang ?? asset.iso_639_1 ?? "").toLowerCase();
  return Boolean(asset.url) && (!code || code === "00" || code === "xx");
}

function fanartCandidate(asset: FanartAsset | undefined): ArtworkCandidate | null {
  if (!asset?.url) return null;
  return { url: asset.url, textless: isTextlessFanartAsset(asset) };
}

export function pickFanartPoster(
  assets: FanartAsset[],
  language: string,
  preferTextless = false,
): ArtworkCandidate | null {
  if (!assets.length) return null;
  const lang = language.split("-")[0]?.toLowerCase() ?? "en";

  if (preferTextless) {
    return fanartCandidate(assets.find(isTextlessFanartAsset) ?? assets.find((a) => a.url));
  }

  const localized = assets.find(
    (a) => (a.lang ?? a.iso_639_1 ?? "").toLowerCase() === lang && a.url,
  );
  if (localized) return fanartCandidate(localized);

  const anyTitled = assets.find((a) => {
    const code = (a.lang ?? a.iso_639_1 ?? "").toLowerCase();
    return a.url && code && code !== "00" && code !== "xx";
  });
  if (anyTitled) return fanartCandidate(anyTitled);

  return fanartCandidate(assets.find(isTextlessFanartAsset) ?? assets[0]);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FANART_TTL_MS = 7 * DAY_MS;
const FANART_MISSING_TTL_MS = DAY_MS;

type FanartMediaType = "movie" | "series";

type FanartArt = { posters: FanartAsset[]; logos: TitleLogoEntry[] };

const FANART_POSTER_KEYS: Record<FanartMediaType, string> = { movie: "movieposter", series: "tvposter" };
const FANART_HD_LOGO_KEYS: Record<FanartMediaType, string> = { movie: "hdmovielogo", series: "hdtvlogo" };
const FANART_SD_LOGO_KEYS: Record<FanartMediaType, string> = { movie: "movielogo", series: "clearlogo" };
const FANART_HD_LOGO_BONUS = 1_000_000;
const FANART_ENGLISH_CODE = "en";
const FANART_NEUTRAL_LANGUAGES = new Set(["00", "xx"]);

function parseFanartRows(payload: Record<string, unknown>, key: string): Record<string, unknown>[] | null {
  const raw = payload[key];
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  return raw.filter((entry): entry is Record<string, unknown> =>
    Boolean(entry) && typeof entry === "object" && typeof (entry as Record<string, unknown>).url === "string",
  );
}

function parseFanartLogos(payload: Record<string, unknown>, key: string, bonus: number): TitleLogoEntry[] {
  return (parseFanartRows(payload, key) ?? []).flatMap((row) => {
    const url = String(row.url);
    if (!url) return [];
    const likes = Number(row.likes);
    return [{
      url,
      language: typeof row.lang === "string" ? row.lang : null,
      score: (Number.isFinite(likes) ? likes : 0) + bonus,
    }];
  });
}

function parseFanartArt(payload: unknown, mediaType: FanartMediaType): FanartArt | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const posterRows = parseFanartRows(record, FANART_POSTER_KEYS[mediaType]);
  if (posterRows == null) return null;
  const posters = posterRows.flatMap((row): FanartAsset[] => {
    const url = String(row.url);
    if (!url) return [];
    const lang = typeof row.lang === "string" ? row.lang : undefined;
    const iso = typeof row.iso_639_1 === "string" ? row.iso_639_1 : undefined;
    return [{ url, lang, iso_639_1: iso }];
  });
  const logos = [
    ...parseFanartLogos(record, FANART_HD_LOGO_KEYS[mediaType], FANART_HD_LOGO_BONUS),
    ...parseFanartLogos(record, FANART_SD_LOGO_KEYS[mediaType], 0),
  ];
  return { posters, logos };
}

export function rankFanartLogos(logos: TitleLogoEntry[], language: string): string[] {
  const primary = language.split("-")[0]?.trim().toLowerCase() || null;
  return rankTitleLogos(logos, [primary, FANART_ENGLISH_CODE], FANART_NEUTRAL_LANGUAGES);
}

type FanartLookup = {
  mediaType: FanartMediaType;
  tmdbId: number;
  tvdbId: number | null;
  apiKey: string;
};

async function fetchFanartArt(params: FanartLookup): Promise<{ art: FanartArt | null; degraded: boolean }> {
  const lookupId = params.mediaType === "movie" ? String(params.tmdbId) : String(params.tvdbId ?? "");
  if (!lookupId) return { art: null, degraded: false };

  const endpoint =
    params.mediaType === "movie"
      ? `https://webservice.fanart.tv/v3/movies/${lookupId}`
      : `https://webservice.fanart.tv/v3/tv/${lookupId}`;

  const url = `${endpoint}?api_key=${encodeURIComponent(params.apiKey)}`;
  const result = await cachedUpstreamJson<FanartArt>({
    provider: "fanart",
    cacheKey: ["art", params.mediaType, lookupId].join("\0"),
    ttlMs: FANART_TTL_MS,
    negativeTtlMs: FANART_MISSING_TTL_MS,
    label: `${params.mediaType} ${lookupId}`,
    credentialFingerprint: upstreamCredentialFingerprint(params.apiKey),
    request: () =>
      fetchUpstream(url, {
        headers: { Accept: "application/json" },
        revalidateSeconds: upstreamNextRevalidateSeconds(FANART_TTL_MS),
      }),
    parse: (payload) => parseFanartArt(payload, params.mediaType),
  });
  return { art: result.value, degraded: result.outcome === "unavailable" };
}

export async function fetchFanartPoster(params: FanartLookup & {
  language: string;
  preferTextless?: boolean;
}): Promise<ArtworkLookup> {
  const { art, degraded } = await fetchFanartArt(params);
  return {
    candidate: pickFanartPoster(art?.posters ?? [], params.language, params.preferTextless ?? false),
    degraded,
  };
}

export async function fetchFanartLogos(
  params: FanartLookup & { language: string },
): Promise<{ urls: string[]; degraded: boolean }> {
  const { art, degraded } = await fetchFanartArt(params);
  return { urls: rankFanartLogos(art?.logos ?? [], params.language), degraded };
}
