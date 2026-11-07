import sharp from "sharp";

import type { ArtworkCandidate } from "@/lib/artwork-candidate";
import { fetchArtworkBytes } from "@/lib/artwork-url-allow";
import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbApiGet } from "@/lib/tmdb-api-get";
import { TMDB_IMAGES_TTL_SEC, type ResolvedTitle, type TmdbBackdropImage } from "@/lib/tmdb-resolve";
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

const MAX_TEXTLESS_CANDIDATES = 3;
const PORTRAIT_FALLBACK_BLUR_SIGMA = 24;
const PORTRAIT_FALLBACK_DIM = 0.55;

type LandscapePick = { path: string; textless: boolean };

export function rankLandscapeBackdrops(
  backdrops: TmdbBackdropImage[],
  defaultPath: string | null,
): LandscapePick[] {
  const picks: LandscapePick[] = backdrops
    .filter((row) => isTextlessBackdrop(row) && isTmdbImagePath(row.file_path))
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, MAX_TEXTLESS_CANDIDATES)
    .map((row) => ({ path: row.file_path!, textless: true }));
  if (isTmdbImagePath(defaultPath) && !picks.some((pick) => pick.path === defaultPath)) {
    const listed = backdrops.find((row) => row.file_path === defaultPath);
    picks.push({ path: defaultPath, textless: listed != null && isTextlessBackdrop(listed) });
  }
  return picks;
}

export function pickLandscapeBackdrop(
  backdrops: TmdbBackdropImage[],
  defaultPath: string | null,
): LandscapePick | null {
  return rankLandscapeBackdrops(backdrops, defaultPath)[0] ?? null;
}

async function fetchTmdbBackdrops(
  resolved: ResolvedTitle,
  credential: TmdbCredential,
): Promise<TmdbBackdropImage[]> {
  if (resolved.backdropImages) return resolved.backdropImages;
  const kind = resolved.stremioType === "movie" ? "movie" : "tv";
  const url = new URL(`https://api.themoviedb.org/3/${kind}/${resolved.tmdbNumericId}/images`);
  url.searchParams.set("include_image_language", "null");
  const raw = await tmdbApiGet(url, credential, { ttlSec: TMDB_IMAGES_TTL_SEC });
  if (!raw || typeof raw !== "object") return [];
  const backdrops = (raw as { backdrops?: unknown }).backdrops;
  return Array.isArray(backdrops) ? (backdrops as TmdbBackdropImage[]) : [];
}

export async function resolveLandscapeCandidates(
  resolved: ResolvedTitle,
  credential: TmdbCredential,
): Promise<ArtworkCandidate[]> {
  const backdrops = await fetchTmdbBackdrops(resolved, credential);
  return rankLandscapeBackdrops(backdrops, resolved.backdropPath).map((pick) => ({
    url: `${TMDB_BACKDROP_BASE_URL}${pick.path}`,
    textless: pick.textless,
  }));
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
  onArtCandidate?: (textless: boolean) => void;
}): Promise<{ buffer: Buffer; textless: boolean } | null> {
  let candidates: ArtworkCandidate[];
  try {
    candidates = await resolveLandscapeCandidates(params.resolved, params.credential);
  } catch (error) {
    console.warn(`[polis] landscape backdrop lookup failed for ${params.imdbId}`, error);
    return null;
  }
  for (const candidate of candidates) {
    params.onArtCandidate?.(candidate.textless);
    try {
      const input = await fetchArtworkBytes(candidate.url, (target, init) => fetchUpstream(target, init));
      if (input) return { buffer: await fitLandscapeCanvas(input), textless: candidate.textless };
    } catch (error) {
      console.warn(`[polis] landscape backdrop failed for ${params.imdbId}`, error);
    }
  }
  return null;
}

export async function landscapeFromPortrait(portrait: Buffer): Promise<Buffer> {
  ensurePolisSharpConfigured();
  const background = await sharp(portrait)
    .resize(LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT, { fit: "cover", position: "centre" })
    .blur(PORTRAIT_FALLBACK_BLUR_SIGMA)
    .linear(PORTRAIT_FALLBACK_DIM, 0)
    .toBuffer();
  const foreground = await sharp(portrait).resize({ height: LANDSCAPE_HEIGHT }).toBuffer();
  const meta = await sharp(foreground).metadata();
  const left = Math.max(0, Math.round((LANDSCAPE_WIDTH - (meta.width ?? 0)) / 2));
  return sharp(background).composite([{ input: foreground, top: 0, left }]).toBuffer();
}
