import { pickAnimeMatchByYear, type AnimeSearchContext } from "@/lib/anime-artwork-match";
import { fetchUpstream } from "@/lib/upstream-fetch";

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

export async function fetchJikanPosterByMalId(malId: number): Promise<string | null> {
  const response = await fetchUpstream(`https://api.jikan.moe/v4/anime/${malId}`, {
    headers: { Accept: "application/json" },
    revalidateSeconds: 86400,
    timeoutMs: 10_000,
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as JikanAnimeResponse;
  return jikanPosterFromImages(payload.data?.images);
}

export async function fetchJikanPosterUrl(ctx: AnimeSearchContext): Promise<string | null> {
  const url = new URL("https://api.jikan.moe/v4/anime");
  url.searchParams.set("q", ctx.title);
  url.searchParams.set("limit", "8");

  const response = await fetchUpstream(url, {
    headers: { Accept: "application/json" },
    revalidateSeconds: 86400,
    timeoutMs: 10_000,
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as JikanSearchResponse;
  type JikanMatch = { year: number | null; url: string; malId: number | undefined };

  const rows: JikanMatch[] =
    payload.data?.flatMap((row) => {
      const url = jikanPosterFromImages(row.images);
      if (!url) return [];
      return [{ year: row.year ?? null, url, malId: row.mal_id }];
    }) ?? [];

  const picked = pickAnimeMatchByYear(rows, ctx.releaseYear);
  if (picked?.url) return picked.url;
  if (picked?.malId != null) return fetchJikanPosterByMalId(picked.malId);
  return null;
}
