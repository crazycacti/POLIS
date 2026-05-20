export const STREMIO_CATALOG_PAGE_SIZE = 100;

export function normalizeStremioPathSegment(raw: string): string {
  return raw.replace(/\.json$/i, "");
}

export function parseStremioCatalogExtra(
  extraPathSegments: string[] | undefined,
  query: URLSearchParams,
): URLSearchParams {
  const merged = new URLSearchParams(query);
  if (!extraPathSegments?.length) return merged;

  for (const segment of extraPathSegments) {
    const cleaned = normalizeStremioPathSegment(segment);
    if (!cleaned) continue;
    const part = new URLSearchParams(cleaned);
    part.forEach((value, key) => {
      merged.set(key, value);
    });
  }

  return merged;
}

export function parseCatalogSkip(extra: URLSearchParams): number {
  const skip = Number(extra.get("skip") ?? "0");
  if (!Number.isFinite(skip) || skip < 0) return 0;
  return Math.floor(skip);
}
