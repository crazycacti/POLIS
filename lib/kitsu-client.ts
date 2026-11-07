import {
  ANIME_ARTWORK_MISSING_TTL_MS,
  ANIME_ARTWORK_TTL_MS,
  animeSearchCacheKey,
  pickAnimeMatchByYear,
  type AnimePosterRow,
  type AnimeSearchContext,
} from "@/lib/anime-artwork-match";
import type { ArtworkUrlLookup } from "@/lib/artwork-candidate";
import { fetchUpstream } from "@/lib/upstream-fetch";
import { cachedUpstreamJson, upstreamNextRevalidateSeconds } from "@/lib/upstream-json-cache";

type KitsuPosterImage = {
  large?: string | null;
  medium?: string | null;
  original?: string | null;
};

type KitsuAnimeAttributes = {
  canonicalTitle?: string | null;
  titles?: { en?: string | null; en_jp?: string | null } | null;
  posterImage?: KitsuPosterImage | null;
  startDate?: string | null;
};

type KitsuAnimeRecord = {
  attributes?: KitsuAnimeAttributes | null;
};

type KitsuListResponse = {
  data?: KitsuAnimeRecord[] | null;
};

function yearFromKitsuDate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const y = Number(raw.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function kitsuPosterFromAttributes(attrs: KitsuAnimeAttributes): string | null {
  const img = attrs.posterImage;
  return img?.large ?? img?.original ?? img?.medium ?? null;
}

function parseKitsuRows(payload: unknown): AnimePosterRow[] | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as KitsuListResponse).data;
  if (!Array.isArray(data)) return null;
  return data.flatMap((row): AnimePosterRow[] => {
    const attrs = row?.attributes;
    if (!attrs) return [];
    const poster = kitsuPosterFromAttributes(attrs);
    if (typeof poster !== "string" || !poster) return [];
    return [{ year: yearFromKitsuDate(attrs.startDate), url: poster }];
  });
}

export async function fetchKitsuPosterUrl(ctx: AnimeSearchContext): Promise<ArtworkUrlLookup> {
  const url = new URL("https://kitsu.app/api/edge/anime");
  url.searchParams.set("filter[text]", ctx.title);
  url.searchParams.set("page[limit]", "8");

  const result = await cachedUpstreamJson<AnimePosterRow[]>({
    provider: "kitsu",
    cacheKey: animeSearchCacheKey("search", ctx.title),
    ttlMs: ANIME_ARTWORK_TTL_MS,
    negativeTtlMs: ANIME_ARTWORK_MISSING_TTL_MS,
    label: "anime search",
    request: () =>
      fetchUpstream(url, {
        headers: { Accept: "application/vnd.api+json" },
        revalidateSeconds: upstreamNextRevalidateSeconds(ANIME_ARTWORK_TTL_MS),
      }),
    parse: parseKitsuRows,
  });
  return {
    url: pickAnimeMatchByYear(result.value ?? [], ctx.releaseYear)?.url ?? null,
    degraded: result.outcome === "unavailable",
  };
}
