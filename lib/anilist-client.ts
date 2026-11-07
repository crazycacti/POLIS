import {
  ANIME_ARTWORK_MISSING_TTL_MS,
  ANIME_ARTWORK_TTL_MS,
  animeSearchCacheKey,
  pickAnimeMatchByYear,
  type AnimePosterRow,
  type AnimeSearchContext,
} from "@/lib/anime-artwork-match";
import { fetchUpstream } from "@/lib/upstream-fetch";
import { cachedUpstreamJson, upstreamNextRevalidateSeconds } from "@/lib/upstream-json-cache";

type AniListMediaRow = {
  id: number;
  startDate?: { year?: number | null } | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
};

type AniListSearchResponse = {
  data?: {
    Page?: {
      media?: AniListMediaRow[] | null;
    } | null;
  };
};

const ANILIST_SEARCH_QUERY = `
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          startDate { year }
          coverImage { extraLarge large }
        }
      }
    }
  `;

function parseAnilistRows(payload: unknown): AnimePosterRow[] | null {
  if (!payload || typeof payload !== "object") return null;
  const media = (payload as AniListSearchResponse).data?.Page?.media;
  if (!Array.isArray(media)) return null;
  return media.flatMap((m): AnimePosterRow[] => {
    const url = m?.coverImage?.extraLarge ?? m?.coverImage?.large ?? null;
    if (typeof url !== "string" || !url) return [];
    const year = m.startDate?.year;
    return [{ year: typeof year === "number" ? year : null, url }];
  });
}

export async function fetchAnilistPosterUrl(ctx: AnimeSearchContext): Promise<string | null> {
  const result = await cachedUpstreamJson<AnimePosterRow[]>({
    provider: "anilist",
    cacheKey: animeSearchCacheKey("search", ctx.title),
    ttlMs: ANIME_ARTWORK_TTL_MS,
    negativeTtlMs: ANIME_ARTWORK_MISSING_TTL_MS,
    label: "anime search",
    request: () =>
      fetchUpstream("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: ANILIST_SEARCH_QUERY, variables: { search: ctx.title } }),
        revalidateSeconds: upstreamNextRevalidateSeconds(ANIME_ARTWORK_TTL_MS),
      }),
    parse: parseAnilistRows,
  });
  return pickAnimeMatchByYear(result.value ?? [], ctx.releaseYear)?.url ?? null;
}
