import sharp from "sharp";

import type { ArtworkCandidate } from "@/lib/artwork-candidate";
import { fetchArtworkBytes } from "@/lib/artwork-url-allow";
import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import type { ResolvedTitle, TmdbBackdropImage } from "@/lib/tmdb-resolve";
import { fetchUpstream } from "@/lib/upstream-fetch";

export const LANDSCAPE_WIDTH = 960;
export const LANDSCAPE_HEIGHT = 540;

const TMDB_BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/w1280";
const TEXTLESS_LANGUAGE_CODES = new Set([null, undefined, "", "xx"]);

function isTextlessBackdrop(row: TmdbBackdropImage): boolean {
  return Boolean(row.file_path) && TEXTLESS_LANGUAGE_CODES.has(row.iso_639_1);
}

function isTmdbImagePath(path: string | null | undefined): path is string {
  return typeof path === "string" && /^\/[A-Za-z0-9_-]+\.(jpe?g|png|webp)$/i.test(path);
}

export function pickLandscapeBackdrop(
  backdrops: TmdbBackdropImage[],
  defaultPath: string | null,
): { path: string; textless: boolean } | null {
  const textless = backdrops
    .filter((row) => isTextlessBackdrop(row) && isTmdbImagePath(row.file_path))
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
  const best = textless[0]?.file_path;
  if (isTmdbImagePath(best)) return { path: best, textless: true };
  if (!isTmdbImagePath(defaultPath)) return null;
  const listed = backdrops.find((row) => row.file_path === defaultPath);
  return { path: defaultPath, textless: listed != null && isTextlessBackdrop(listed) };
}

async function fetchTmdbBackdrops(
  resolved: ResolvedTitle,
  credential: TmdbCredential,
): Promise<TmdbBackdropImage[]> {
  if (resolved.backdropImages) return resolved.backdropImages;
  const kind = resolved.stremioType === "movie" ? "movie" : "tv";
  const url = new URL(`https://api.themoviedb.org/3/${kind}/${resolved.tmdbNumericId}/images`);
  url.searchParams.set("include_image_language", "null");
  const raw = await tmdbApiGet(url, credential);
  if (!raw || typeof raw !== "object") return [];
  const backdrops = (raw as { backdrops?: unknown }).backdrops;
  return Array.isArray(backdrops) ? (backdrops as TmdbBackdropImage[]) : [];
}

export async function resolveLandscapeCandidate(
  resolved: ResolvedTitle,
  credential: TmdbCredential,
): Promise<ArtworkCandidate | null> {
  const backdrops = await fetchTmdbBackdrops(resolved, credential);
  const pick = pickLandscapeBackdrop(backdrops, resolved.backdropPath);
  return pick ? { url: `${TMDB_BACKDROP_BASE_URL}${pick.path}`, textless: pick.textless } : null;
}

export async function fitLandscapeCanvas(input: Buffer): Promise<Buffer> {
  ensurePolisSharpConfigured();
  return sharp(input)
    .resize(LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT, { fit: "cover", position: "centre" })
    .toBuffer();
}

export async function fetchLandscapeBase(params: {
  imdbId: string;
  resolved: ResolvedTitle;
  credential: TmdbCredential;
}): Promise<{ buffer: Buffer; textless: boolean } | null> {
  const candidate = await resolveLandscapeCandidate(params.resolved, params.credential);
  if (!candidate) return null;
  const input = await fetchArtworkBytes(candidate.url, (target, init) => fetchUpstream(target, init));
  if (!input) {
    console.warn(`[polis] landscape backdrop download failed for ${params.imdbId}`);
    return null;
  }
  return { buffer: await fitLandscapeCanvas(input), textless: candidate.textless };
}
