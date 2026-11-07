type FanartAsset = {
  url?: string;
  lang?: string;
  iso_639_1?: string | null;
};

import type { ArtworkCandidate, ArtworkLookup } from "@/lib/artwork-candidate";
import { fetchUpstream } from "@/lib/upstream-fetch";
import { upstreamCredentialFingerprint } from "@/lib/upstream-guard";
import { cachedUpstreamJson, upstreamNextRevalidateSeconds } from "@/lib/upstream-json-cache";

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

function parseFanartAssets(payload: unknown, key: "movieposter" | "tvposter"): FanartAsset[] | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>)[key];
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((entry): FanartAsset[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.url !== "string" || !row.url) return [];
    const lang = typeof row.lang === "string" ? row.lang : undefined;
    const iso = typeof row.iso_639_1 === "string" ? row.iso_639_1 : undefined;
    return [{ url: row.url, lang, iso_639_1: iso }];
  });
}

export async function fetchFanartPoster(params: {
  mediaType: "movie" | "series";
  tmdbId: number;
  tvdbId: number | null;
  apiKey: string;
  language: string;
  preferTextless?: boolean;
}): Promise<ArtworkLookup> {
  const lookupId = params.mediaType === "movie" ? String(params.tmdbId) : String(params.tvdbId ?? "");
  if (!lookupId) return { candidate: null, degraded: false };

  const endpoint =
    params.mediaType === "movie"
      ? `https://webservice.fanart.tv/v3/movies/${lookupId}`
      : `https://webservice.fanart.tv/v3/tv/${lookupId}`;
  const assetKey = params.mediaType === "movie" ? "movieposter" : "tvposter";

  const url = `${endpoint}?api_key=${encodeURIComponent(params.apiKey)}`;
  const result = await cachedUpstreamJson<FanartAsset[]>({
    provider: "fanart",
    cacheKey: [assetKey, lookupId].join("\0"),
    ttlMs: FANART_TTL_MS,
    negativeTtlMs: FANART_MISSING_TTL_MS,
    label: `${params.mediaType} ${lookupId}`,
    credentialFingerprint: upstreamCredentialFingerprint(params.apiKey),
    request: () =>
      fetchUpstream(url, {
        headers: { Accept: "application/json" },
        revalidateSeconds: upstreamNextRevalidateSeconds(FANART_TTL_MS),
      }),
    parse: (payload) => parseFanartAssets(payload, assetKey),
  });

  return {
    candidate: pickFanartPoster(result.value ?? [], params.language, params.preferTextless ?? false),
    degraded: result.outcome === "unavailable",
  };
}
