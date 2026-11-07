import { readFile } from "node:fs/promises";

import sharp from "sharp";

import {
  polisDiskCacheEnabled,
  resolvePolisDiskCachePath,
  trimPolisDiskNamespace,
  writePolisDiskBytes,
} from "@/lib/polis-disk-cache";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { withPolisRenderLimit } from "@/lib/polis-render-limit";
import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { PREVIEW_THUMB_WIDTHS, type PreviewThumbWidth } from "@/lib/preview-sizes";

export { PREVIEW_THUMB_WIDTHS, type PreviewThumbWidth } from "@/lib/preview-sizes";

export const PREVIEW_THUMB_CONTENT_TYPE = "image/webp";
export type PreviewWidthParse = { ok: true; width: PreviewThumbWidth | null } | { ok: false };

const PREVIEW_THUMB_EXT = ".webp";
const PREVIEW_THUMB_WEBP_QUALITY = 78;
const PREVIEW_THUMB_WEBP_EFFORT = 4;
const DEFAULT_TITLE_PREVIEW_MAX_FILES = 4000;
const DEFAULT_DEMO_THUMB_MAX_FILES = 1000;
const PREVIEW_TRIM_INTERVAL_MS = 60 * 1000;

export type PreviewStore = { namespace: string; maxFiles: () => number };

export const TITLE_PREVIEW_STORE: PreviewStore = {
  namespace: "preview",
  maxFiles: () => polisEnvPositiveInt("POLIS_PREVIEW_CACHE_MAX_FILES") ?? DEFAULT_TITLE_PREVIEW_MAX_FILES,
};

export const DEMO_THUMB_STORE: PreviewStore = {
  namespace: "demo-thumb",
  maxFiles: () => polisEnvPositiveInt("POLIS_DEMO_THUMB_CACHE_MAX_FILES") ?? DEFAULT_DEMO_THUMB_MAX_FILES,
};

const lastTrimAt = new Map<string, number>();
const trimInFlight = new Set<string>();

export function parsePreviewWidth(raw: string | null): PreviewWidthParse {
  if (raw == null) return { ok: true, width: null };
  const width = PREVIEW_THUMB_WIDTHS.find((allowed) => String(allowed) === raw);
  return width != null ? { ok: true, width } : { ok: false };
}

export function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function scheduleTrim(store: PreviewStore): void {
  const now = Date.now();
  if (trimInFlight.has(store.namespace) || now - (lastTrimAt.get(store.namespace) ?? 0) < PREVIEW_TRIM_INTERVAL_MS) {
    return;
  }
  lastTrimAt.set(store.namespace, now);
  trimInFlight.add(store.namespace);
  void trimPolisDiskNamespace(store.namespace, store.maxFiles())
    .catch((error: unknown) => console.warn(`[polis] ${store.namespace} cache trim failed`, error))
    .finally(() => trimInFlight.delete(store.namespace));
}

export function previewCachedPath(
  store: PreviewStore,
  scope: string,
  cacheKey: string,
  ext: string,
  ttlMs?: number,
): Promise<string | null> {
  return resolvePolisDiskCachePath(store.namespace, scope, cacheKey, ext, ttlMs);
}

export async function readPreviewCacheFile(path: string): Promise<Buffer | null> {
  try {
    return await readFile(/*turbopackIgnore: true*/ path);
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function writePreviewCache(
  store: PreviewStore,
  scope: string,
  cacheKey: string,
  ext: string,
  image: Buffer,
): Promise<void> {
  if (!polisDiskCacheEnabled()) return;
  await writePolisDiskBytes(store.namespace, scope, cacheKey, ext, image);
  scheduleTrim(store);
}

export function previewThumbCacheKey(fullKey: string, width: PreviewThumbWidth): string {
  return `${fullKey}\0w${width}`;
}

export async function resizePreviewThumb(image: Buffer, width: PreviewThumbWidth): Promise<Buffer> {
  return withPolisRenderLimit(() => {
    ensurePolisSharpConfigured();
    return sharp(image)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: PREVIEW_THUMB_WEBP_QUALITY, effort: PREVIEW_THUMB_WEBP_EFFORT })
      .toBuffer();
  });
}

export type PreviewImage =
  | { source: "disk"; path: string }
  | { source: "buffer"; image: Buffer; cacheable: boolean };

export type PreviewFullLoad<F> =
  | { kind: "full"; image: Buffer; cacheable: boolean }
  | { kind: "failed"; failure: F }
  | null;

export type PreviewThumbResult<F> = PreviewImage | { source: "failed"; failure: F } | null;

export async function cachedPreviewThumb<F>(params: {
  store: PreviewStore;
  scope: string;
  fullKey: string;
  width: PreviewThumbWidth;
  ttlMs?: number;
  flightTag: string;
  loadFull: () => Promise<PreviewFullLoad<F>>;
}): Promise<PreviewThumbResult<F>> {
  const thumbKey = previewThumbCacheKey(params.fullKey, params.width);
  const find = () => previewCachedPath(params.store, params.scope, thumbKey, PREVIEW_THUMB_EXT, params.ttlMs);
  const hit = await find();
  if (hit) return { source: "disk", path: hit };

  const flightKey = `preview-thumb:${params.store.namespace}:${params.scope}:${params.flightTag}:${thumbKey}`;
  return polisSingleflight(flightKey, async (): Promise<PreviewThumbResult<F>> => {
    const raced = await find();
    if (raced) return { source: "disk", path: raced };
    const full = await params.loadFull();
    if (!full) return null;
    if (full.kind === "failed") return { source: "failed", failure: full.failure };
    const thumb = await resizePreviewThumb(full.image, params.width);
    if (full.cacheable) {
      await writePreviewCache(params.store, params.scope, thumbKey, PREVIEW_THUMB_EXT, thumb).catch(
        (error: unknown) => console.warn("[polis] preview thumbnail cache write failed", error),
      );
    }
    return { source: "buffer", image: thumb, cacheable: full.cacheable };
  });
}

export async function cachedPreviewThumbExists(
  store: PreviewStore,
  scope: string,
  fullKey: string,
  width: PreviewThumbWidth,
  ttlMs?: number,
): Promise<boolean> {
  return (await previewCachedPath(store, scope, previewThumbCacheKey(fullKey, width), PREVIEW_THUMB_EXT, ttlMs)) != null;
}
