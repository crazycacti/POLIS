type FanartAsset = {
  url?: string;
  lang?: string;
  iso_639_1?: string | null;
};

import type { ArtworkCandidate } from "@/lib/artwork-candidate";
import { fetchUpstream } from "@/lib/upstream-fetch";

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

export async function fetchFanartPoster(params: {
  mediaType: "movie" | "series";
  tmdbId: number;
  tvdbId: number | null;
  apiKey: string;
  language: string;
  preferTextless?: boolean;
}): Promise<ArtworkCandidate | null> {
  const lookupId = params.mediaType === "movie" ? String(params.tmdbId) : String(params.tvdbId ?? "");
  if (!lookupId) return null;

  const endpoint =
    params.mediaType === "movie"
      ? `https://webservice.fanart.tv/v3/movies/${lookupId}`
      : `https://webservice.fanart.tv/v3/tv/${lookupId}`;

  const url = `${endpoint}?api_key=${encodeURIComponent(params.apiKey)}`;
  const response = await fetchUpstream(url, {
    headers: { Accept: "application/json" },
    revalidateSeconds: 86400,
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as Record<string, FanartAsset[] | undefined>;
  const posters =
    params.mediaType === "movie"
      ? (payload.movieposter ?? [])
      : (payload.tvposter ?? []);

  return pickFanartPoster(posters, params.language, params.preferTextless ?? false);
}
