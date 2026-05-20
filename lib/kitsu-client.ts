import { pickAnimeMatchByYear, type AnimeSearchContext } from "@/lib/anime-artwork-match";
import { fetchUpstream } from "@/lib/upstream-fetch";

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

export async function fetchKitsuPosterUrl(ctx: AnimeSearchContext): Promise<string | null> {
  const url = new URL("https://kitsu.app/api/edge/anime");
  url.searchParams.set("filter[text]", ctx.title);
  url.searchParams.set("page[limit]", "8");

  const response = await fetchUpstream(url, {
    headers: { Accept: "application/vnd.api+json" },
    revalidateSeconds: 86400,
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as KitsuListResponse;
  const rows =
    payload.data?.map((row) => {
      const attrs = row.attributes;
      if (!attrs) return null;
      const poster = kitsuPosterFromAttributes(attrs);
      if (!poster) return null;
      return { year: yearFromKitsuDate(attrs.startDate), url: poster };
    }) ?? [];

  const withUrl = rows.filter((r): r is { year: number | null; url: string } => r != null);
  const picked = pickAnimeMatchByYear(withUrl, ctx.releaseYear);
  return picked?.url ?? null;
}
