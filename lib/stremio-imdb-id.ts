const IMDB_ID = /^tt\d+$/;

export function normalizeMetaPathId(raw: string): string {
  return raw.replace(/\.json$/i, "");
}

export function isImdbId(id: string): boolean {
  return IMDB_ID.test(id);
}
