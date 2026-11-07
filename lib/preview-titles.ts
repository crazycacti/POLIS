import { readPolisDiskJson, writePolisDiskJson } from "@/lib/polis-disk-cache";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { mapWithConcurrency, tmdbImdbIdForItem } from "@/lib/stremio-catalog-fetch";
import { isImdbId } from "@/lib/stremio-imdb-id";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";

export type PreviewTitle = { imdbId: string; title: string; type: "movie" | "series" };

export const PREVIEW_TITLE_LIMIT = 6;
export const PREVIEW_TITLES_TTL_SEC = 24 * 60 * 60;

const PREVIEW_TITLES_LANGUAGE = "en-US";
const PREVIEW_CANDIDATE_LIMIT = PREVIEW_TITLE_LIMIT * 2;
const PREVIEW_EXTERNAL_ID_CONCURRENCY = 4;
const PREVIEW_CACHE_NAMESPACE = "preview-titles";
const PREVIEW_CACHE_SCOPE = "g";
const PREVIEW_CACHE_KEY = `trending-all-week-${PREVIEW_TITLES_LANGUAGE}`;

type TrendingCandidate = { tmdbId: number; title: string; type: "movie" | "series" };

export function trendingPreviewCandidates(payload: unknown): TrendingCandidate[] {
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const out: TrendingCandidate[] = [];
  for (const row of results) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const type =
      record.media_type === "movie" ? "movie" : record.media_type === "tv" ? "series" : null;
    if (!type || typeof record.id !== "number") continue;
    const rawTitle = type === "movie" ? record.title : record.name;
    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    if (!title) continue;
    out.push({ tmdbId: record.id, title, type });
  }
  return out;
}

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

export function tmdbCredentialFromRaw(raw: string): TmdbCredential | null {
  const params = inferTmdbCredentialParams(raw).params;
  const token = params?.get("tmdb_access_token");
  if (token) return { kind: "bearer", token };
  const key = params?.get("api_key");
  return key ? { kind: "api_key", key } : null;
}

async function buildPreviewTitles(credential: TmdbCredential): Promise<PreviewTitle[]> {
  const url = new URL("https://api.themoviedb.org/3/trending/all/week");
  url.searchParams.set("language", PREVIEW_TITLES_LANGUAGE);
  const payload = await tmdbApiGet(url, credential, { ttlSec: PREVIEW_TITLES_TTL_SEC });
  const candidates = trendingPreviewCandidates(payload).slice(0, PREVIEW_CANDIDATE_LIMIT);
  const resolved = await mapWithConcurrency(candidates, PREVIEW_EXTERNAL_ID_CONCURRENCY, async (row) => {
    const imdbId = await tmdbImdbIdForItem({
      tmdbId: row.tmdbId,
      stremioType: row.type,
      credential,
    }).catch(() => null);
    return imdbId ? { imdbId, title: row.title, type: row.type } : null;
  });
  const seen = new Set<string>();
  const titles: PreviewTitle[] = [];
  for (const title of resolved) {
    if (!title || seen.has(title.imdbId)) continue;
    seen.add(title.imdbId);
    titles.push(title);
  }
  return titles.slice(0, PREVIEW_TITLE_LIMIT);
}

export async function fetchPreviewTitles(credential: TmdbCredential): Promise<PreviewTitle[]> {
  const ttlMs = PREVIEW_TITLES_TTL_SEC * 1000;
  const read = async () =>
    parsePreviewTitles(
      await readPolisDiskJson<unknown>(PREVIEW_CACHE_NAMESPACE, PREVIEW_CACHE_SCOPE, PREVIEW_CACHE_KEY, ttlMs),
    );
  const cached = await read();
  if (cached && cached.length > 0) return cached;

  return polisSingleflight(`preview-titles\0${PREVIEW_CACHE_KEY}`, async () => {
    const raced = await read();
    if (raced && raced.length > 0) return raced;
    const titles = await buildPreviewTitles(credential);
    if (titles.length > 0) {
      await writePolisDiskJson(PREVIEW_CACHE_NAMESPACE, PREVIEW_CACHE_SCOPE, PREVIEW_CACHE_KEY, titles).catch(
        (error: unknown) => {
          console.warn("[polis] preview titles cache write failed", error);
        },
      );
    }
    return titles;
  });
}
