export type AnimeSearchContext = {
  title: string;
  releaseYear: string | undefined;
};

export function pickAnimeMatchByYear<T extends { year: number | null }>(
  items: T[],
  releaseYear: string | undefined,
): T | null {
  if (!items.length) return null;
  const target = releaseYear ? Number(releaseYear) : NaN;
  if (Number.isFinite(target)) {
    const exact = items.find((i) => i.year === target);
    if (exact) return exact;
    const close = items.find((i) => i.year != null && Math.abs(i.year - target) <= 1);
    if (close) return close;
  }
  return items[0] ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const ANIME_ARTWORK_TTL_MS = 7 * DAY_MS;
export const ANIME_ARTWORK_MISSING_TTL_MS = DAY_MS;

export type AnimePosterRow = { year: number | null; url: string };

export function animeSearchCacheKey(kind: string, title: string): string {
  return [kind, title.trim().toLowerCase()].join("\0");
}
