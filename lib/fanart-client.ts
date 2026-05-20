type FanartAsset = {
  url?: string;
  lang?: string;
  iso_639_1?: string | null;
};

import { fetchUpstream } from "@/lib/upstream-fetch";

function isTextlessFanartAsset(asset: FanartAsset): boolean {
  const code = (asset.lang ?? asset.iso_639_1 ?? "").toLowerCase();
  return Boolean(asset.url) && (!code || code === "00" || code === "xx");
}

export function pickFanartPosterUrl(
  assets: FanartAsset[],
  language: string,
  preferTextless = false,
): string | null {
  if (!assets.length) return null;
  const lang = language.split("-")[0]?.toLowerCase() ?? "en";

  if (preferTextless) {
    const textless = assets.find(isTextlessFanartAsset);
    if (textless?.url) return textless.url;
    return assets.find((a) => a.url)?.url ?? null;
  }

  const localized = assets.find(
    (a) => (a.lang ?? a.iso_639_1 ?? "").toLowerCase() === lang && a.url,
  );
  if (localized?.url) return localized.url;

  const anyTitled = assets.find((a) => {
    const code = (a.lang ?? a.iso_639_1 ?? "").toLowerCase();
    return a.url && code && code !== "00" && code !== "xx";
  });
  if (anyTitled?.url) return anyTitled.url;

  const textless = assets.find(isTextlessFanartAsset);
  if (textless?.url) return textless.url;

  return assets[0]?.url ?? null;
}

export async function fetchFanartPosterUrl(params: {
  mediaType: "movie" | "series";
  tmdbId: number;
  tvdbId: number | null;
  apiKey: string;
  language: string;
  preferTextless?: boolean;
}): Promise<string | null> {
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

  return pickFanartPosterUrl(posters, params.language, params.preferTextless ?? false);
}
