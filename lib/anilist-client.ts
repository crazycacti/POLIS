import { pickAnimeMatchByYear, type AnimeSearchContext } from "@/lib/anime-artwork-match";
import { fetchUpstream } from "@/lib/upstream-fetch";

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

export async function fetchAnilistPosterUrl(ctx: AnimeSearchContext): Promise<string | null> {
  const query = `
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

  const response = await fetchUpstream("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search: ctx.title } }),
    revalidateSeconds: 86400,
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as AniListSearchResponse;
  const media = payload.data?.Page?.media ?? [];
  const rows = media.map((m) => ({
    year: m.startDate?.year ?? null,
    url: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
  }));
  const withUrl = rows.filter((r): r is { year: number | null; url: string } => Boolean(r.url));
  const picked = pickAnimeMatchByYear(withUrl, ctx.releaseYear);
  return picked?.url ?? null;
}
