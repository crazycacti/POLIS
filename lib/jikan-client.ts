import {
  ANIME_ARTWORK_MISSING_TTL_MS,
  ANIME_ARTWORK_TTL_MS,
  animeSearchCacheKey,
  pickAnimeMatchByYear,
  type AnimeSearchContext,
} from "@/lib/anime-artwork-match";
import { fetchUpstream } from "@/lib/upstream-fetch";
import { cachedUpstreamJson, upstreamNextRevalidateSeconds } from "@/lib/upstream-json-cache";

type JikanAnimeImages = {
  jpg?: { large_image_url?: string | null; image_url?: string | null } | null;
  webp?: { large_image_url?: string | null; image_url?: string | null } | null;
};

type JikanAnimeRow = {
  mal_id?: number;
  title?: string;
  year?: number | null;
  images?: JikanAnimeImages | null;
};

type JikanSearchResponse = {
  data?: JikanAnimeRow[] | null;
};

type JikanAnimeResponse = {
  data?: JikanAnimeRow | null;
};

type JikanMatch = { year: number | null; url: string; malId: number | undefined };

const JIKAN_TIMEOUT_MS = 10_000;

function jikanPosterFromImages(images: JikanAnimeImages | null | undefined): string | null {
  if (!images) return null;
  return (
    images.jpg?.large_image_url ??
    images.jpg?.image_url ??
    images.webp?.large_image_url ??
    images.webp?.image_url ??
    null
  );
}

function jikanGet(url: URL | string): Promise<Response> {
  return fetchUpstream(url, {
    headers: { Accept: "application/json" },
    revalidateSeconds: upstreamNextRevalidateSeconds(ANIME_ARTWORK_TTL_MS),
    timeoutMs: JIKAN_TIMEOUT_MS,
  });
}

export async function fetchJikanPosterByMalId(malId: number): Promise<string | null> {
  const result = await cachedUpstreamJson<{ url: string | null }>({
    provider: "jikan",
    cacheKey: ["anime", malId].join("\0"),
    ttlMs: ANIME_ARTWORK_TTL_MS,
    negativeTtlMs: ANIME_ARTWORK_MISSING_TTL_MS,
    label: `anime ${malId}`,
    request: () => jikanGet(`https://api.jikan.moe/v4/anime/${malId}`),
    parse: (payload) => {
      if (!payload || typeof payload !== "object") return null;
      const url = jikanPosterFromImages((payload as JikanAnimeResponse).data?.images);
      return { url: typeof url === "string" && url ? url : null };
    },
  });
  return result.value?.url ?? null;
}

function parseJikanRows(payload: unknown): JikanMatch[] | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as JikanSearchResponse).data;
  if (!Array.isArray(data)) return null;
  return data.flatMap((row): JikanMatch[] => {
    const url = jikanPosterFromImages(row?.images);
    if (typeof url !== "string" || !url) return [];
    return [{ year: typeof row.year === "number" ? row.year : null, url, malId: row.mal_id }];
  });
}

export async function fetchJikanPosterUrl(ctx: AnimeSearchContext): Promise<string | null> {
  const url = new URL("https://api.jikan.moe/v4/anime");
  url.searchParams.set("q", ctx.title);
  url.searchParams.set("limit", "8");

  const result = await cachedUpstreamJson<JikanMatch[]>({
    provider: "jikan",
    cacheKey: animeSearchCacheKey("search", ctx.title),
    ttlMs: ANIME_ARTWORK_TTL_MS,
    negativeTtlMs: ANIME_ARTWORK_MISSING_TTL_MS,
    label: "anime search",
    request: () => jikanGet(url),
    parse: parseJikanRows,
  });

  const picked = pickAnimeMatchByYear(result.value ?? [], ctx.releaseYear);
  if (picked?.url) return picked.url;
  if (picked?.malId != null) return fetchJikanPosterByMalId(picked.malId);
  return null;
}
