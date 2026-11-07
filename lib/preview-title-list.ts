import { isImdbId } from "@/lib/stremio-imdb-id";

export type PreviewTitle = { imdbId: string; title: string; type: "movie" | "series" };

export function parsePreviewTitles(raw: unknown): PreviewTitle[] | null {
  if (!Array.isArray(raw)) return null;
  const titles: PreviewTitle[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const record = row as Record<string, unknown>;
    if (typeof record.imdbId !== "string" || !isImdbId(record.imdbId)) return null;
    if (typeof record.title !== "string" || !record.title.trim()) return null;
    if (record.type !== "movie" && record.type !== "series") return null;
    titles.push({ imdbId: record.imdbId, title: record.title, type: record.type });
  }
  return titles;
}
