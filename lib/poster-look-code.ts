import {
  parsePosterOverlayQuery,
  POSTER_OVERLAY_DEFAULTS,
  serializePosterQuery,
  type PosterOverlayQuery,
} from "@/lib/poster-query";

const LOOK_CODE_PREFIX = "v1.";
export const LOOK_CODE_PARAM = "look";
export const LOOK_CODE_MAX_LENGTH = 4096;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

const NON_LOOK_KEYS = new Set<keyof PosterOverlayQuery>([
  "artwork",
  "artworkMovie",
  "artworkFallback",
  "trendRank",
  "posterShape",
]);

export type PosterLookFields = Partial<PosterOverlayQuery>;

function isLookKey(key: string): key is keyof PosterOverlayQuery {
  return Object.hasOwn(POSTER_OVERLAY_DEFAULTS, key) && !NON_LOOK_KEYS.has(key as keyof PosterOverlayQuery);
}

export function lookFieldsOf(overlay: PosterOverlayQuery): PosterLookFields {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overlay)) {
    if (isLookKey(key)) fields[key] = value;
  }
  return fields as PosterLookFields;
}

function normalizeOverlay(overlay: PosterOverlayQuery): PosterOverlayQuery {
  return parsePosterOverlayQuery(new URLSearchParams(serializePosterQuery(overlay)));
}

export function applyLookFields(
  overlay: PosterOverlayQuery,
  fields: PosterLookFields,
): PosterOverlayQuery {
  const merged = normalizeOverlay({ ...overlay, ...lookFieldsOf({ ...overlay, ...fields }) });
  return {
    ...merged,
    artwork: overlay.artwork,
    artworkMovie: overlay.artworkMovie,
    artworkFallback: overlay.artworkFallback,
    trendRank: overlay.trendRank,
  };
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string | null {
  if (!BASE64URL_RE.test(code)) return null;
  const padded = code.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  } catch {
    return null;
  }
}

export function encodeLookCode(overlay: PosterOverlayQuery): string {
  return LOOK_CODE_PREFIX + toBase64Url(serializePosterQuery({ ...overlay, trendRank: null }));
}

export function lookShareUrl(origin: string, overlay: PosterOverlayQuery): string {
  const url = new URL("/configure", origin);
  url.searchParams.set(LOOK_CODE_PARAM, encodeLookCode(overlay));
  return url.toString();
}

function codeFromInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith(LOOK_CODE_PREFIX)) return trimmed;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).searchParams.get(LOOK_CODE_PARAM) ?? "";
  } catch {
    return "";
  }
}

export function decodeLookCode(input: string): PosterLookFields | null {
  if (input.length > LOOK_CODE_MAX_LENGTH) return null;
  const code = codeFromInput(input);
  if (!code.startsWith(LOOK_CODE_PREFIX)) return null;
  const query = fromBase64Url(code.slice(LOOK_CODE_PREFIX.length));
  if (query == null) return null;
  return lookFieldsOf(parsePosterOverlayQuery(new URLSearchParams(query)));
}

export function lookCodeFromSearch(search: string): string | null {
  return new URLSearchParams(search).get(LOOK_CODE_PARAM);
}

export function lookToJson(overlay: PosterOverlayQuery): string {
  return JSON.stringify(lookFieldsOf(overlay), null, 2);
}

export type LookJsonResult =
  | { ok: true; fields: PosterLookFields }
  | { ok: false; error: string };

export function parseLookJson(text: string): LookJsonResult {
  if (text.length > LOOK_CODE_MAX_LENGTH) return { ok: false, error: "This look is too long." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "This is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "A look is a JSON object of settings." };
  }
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!isLookKey(key)) return { ok: false, error: `Unknown setting: ${key}` };
    const expected = typeof POSTER_OVERLAY_DEFAULTS[key];
    if (typeof value !== expected) {
      return { ok: false, error: `${key} must be a ${expected}.` };
    }
    fields[key] = value;
  }
  return { ok: true, fields: fields as PosterLookFields };
}

export function rejectedLookFields(
  overlay: PosterOverlayQuery,
  fields: PosterLookFields,
): (keyof PosterOverlayQuery)[] {
  const applied = applyLookFields(overlay, fields);
  return (Object.keys(fields) as (keyof PosterOverlayQuery)[]).filter(
    (key) => applied[key] !== fields[key],
  );
}
