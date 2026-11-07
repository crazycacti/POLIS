export const PREVIEW_KEYS_COOKIE = "polis_preview_keys";
export const PREVIEW_ROUTE_PREFIX = "/preview";

const PREVIEW_KEY_MAX_CHARS = 1024;

export type PreviewCallerKeys = {
  tmdb: string | null;
  mdblist: string | null;
  fanart: string | null;
  tvdb: string | null;
};

export const NO_PREVIEW_CALLER_KEYS: PreviewCallerKeys = { tmdb: null, mdblist: null, fanart: null, tvdb: null };

const COOKIE_FIELDS = { tmdb: "t", mdblist: "m", fanart: "f", tvdb: "v" } as const satisfies Record<
  keyof PreviewCallerKeys,
  string
>;

export function cleanPreviewKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > PREVIEW_KEY_MAX_CHARS) return null;
  return trimmed;
}

export function hasPreviewCallerKeys(keys: PreviewCallerKeys): boolean {
  return Object.values(keys).some((value) => value != null);
}

export function serializePreviewKeysCookie(keys: PreviewCallerKeys): string {
  const payload: Record<string, string> = {};
  for (const [field, short] of Object.entries(COOKIE_FIELDS) as [keyof PreviewCallerKeys, string][]) {
    const value = cleanPreviewKey(keys[field]);
    if (value) payload[short] = value;
  }
  return JSON.stringify(payload);
}

export function parsePreviewKeysCookie(raw: string | null | undefined): PreviewCallerKeys {
  if (!raw) return NO_PREVIEW_CALLER_KEYS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NO_PREVIEW_CALLER_KEYS;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NO_PREVIEW_CALLER_KEYS;
  const record = parsed as Record<string, unknown>;
  return {
    tmdb: cleanPreviewKey(record[COOKIE_FIELDS.tmdb]),
    mdblist: cleanPreviewKey(record[COOKIE_FIELDS.mdblist]),
    fanart: cleanPreviewKey(record[COOKIE_FIELDS.fanart]),
    tvdb: cleanPreviewKey(record[COOKIE_FIELDS.tvdb]),
  };
}

export function previewKeysCookieHeader(keys: PreviewCallerKeys, secure: boolean): string {
  const base = `Path=${PREVIEW_ROUTE_PREFIX}; SameSite=Strict${secure ? "; Secure" : ""}`;
  if (!hasPreviewCallerKeys(keys)) return `${PREVIEW_KEYS_COOKIE}=; ${base}; Max-Age=0`;
  return `${PREVIEW_KEYS_COOKIE}=${encodeURIComponent(serializePreviewKeysCookie(keys))}; ${base}`;
}

export function previewProvidersTag(available: {
  tmdb: boolean;
  mdblist: boolean;
  fanart: boolean;
  tvdb: boolean;
}): string {
  return `t${Number(available.tmdb)}m${Number(available.mdblist)}f${Number(available.fanart)}v${Number(available.tvdb)}`;
}

const KEY_SET_HASH_CHARS = 8;
const NO_KEYS_HASH = "none";
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX_RADIX = 16;
const BYTE_HEX_CHARS = 2;
const UINT32_HEX_CHARS = 8;

function fnv1aHex(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(HEX_RADIX).padStart(UINT32_HEX_CHARS, "0");
}

export async function previewKeySetHash(keys: PreviewCallerKeys): Promise<string> {
  if (!hasPreviewCallerKeys(keys)) return NO_KEYS_HASH;
  const joined = serializePreviewKeysCookie(keys);
  const subtle = globalThis.crypto?.subtle;
  // crypto.subtle exists only in secure contexts; plain-http LAN installs fall back to FNV-1a.
  if (!subtle) return fnv1aHex(joined).slice(0, KEY_SET_HASH_CHARS);
  const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(joined)));
  return Array.from(digest, (byte) => byte.toString(HEX_RADIX).padStart(BYTE_HEX_CHARS, "0"))
    .join("")
    .slice(0, KEY_SET_HASH_CHARS);
}
