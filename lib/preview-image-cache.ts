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

export const PREVIEW_CACHE_NAMESPACE = "preview";
export const PREVIEW_THUMB_CONTENT_TYPE = "image/webp";
export type PreviewWidthParse = { ok: true; width: PreviewThumbWidth | null } | { ok: false };

const PREVIEW_THUMB_EXT = ".webp";
const PREVIEW_THUMB_WEBP_QUALITY = 78;
const PREVIEW_THUMB_WEBP_EFFORT = 4;
const DEFAULT_PREVIEW_CACHE_MAX_FILES = 4000;
const PREVIEW_TRIM_INTERVAL_MS = 60 * 1000;

let lastTrimAt = 0;
let trimInFlight: Promise<void> | null = null;

export function parsePreviewWidth(raw: string | null): PreviewWidthParse {
  if (raw == null) return { ok: true, width: null };
  const width = PREVIEW_THUMB_WIDTHS.find((allowed) => String(allowed) === raw);
  return width != null ? { ok: true, width } : { ok: false };
}

export function previewCacheMaxFiles(): number {
  return polisEnvPositiveInt("POLIS_PREVIEW_CACHE_MAX_FILES") ?? DEFAULT_PREVIEW_CACHE_MAX_FILES;
}

function scheduleTrim(): void {
  if (trimInFlight || Date.now() - lastTrimAt < PREVIEW_TRIM_INTERVAL_MS) return;
  lastTrimAt = Date.now();
  trimInFlight = trimPolisDiskNamespace(PREVIEW_CACHE_NAMESPACE, previewCacheMaxFiles())
    .then(() => undefined)
    .catch((error: unknown) => console.warn("[polis] preview cache trim failed", error))
    .finally(() => {
      trimInFlight = null;
    });
}

export function previewCachedPath(
  scope: string,
  cacheKey: string,
  ext: string,
  ttlMs?: number,
): Promise<string | null> {
  return resolvePolisDiskCachePath(PREVIEW_CACHE_NAMESPACE, scope, cacheKey, ext, ttlMs);
}

export async function writePreviewCache(scope: string, cacheKey: string, ext: string, image: Buffer): Promise<void> {
  if (!polisDiskCacheEnabled()) return;
  await writePolisDiskBytes(PREVIEW_CACHE_NAMESPACE, scope, cacheKey, ext, image);
  scheduleTrim();
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

export type PreviewFullImage = { image: Buffer; cacheable: boolean };

export async function cachedPreviewThumb(params: {
  scope: string;
  fullKey: string;
  width: PreviewThumbWidth;
  ttlMs?: number;
  loadFull: () => Promise<PreviewFullImage | null>;
}): Promise<PreviewImage | null> {
  const thumbKey = previewThumbCacheKey(params.fullKey, params.width);
  const hit = await previewCachedPath(params.scope, thumbKey, PREVIEW_THUMB_EXT, params.ttlMs);
  if (hit) return { source: "disk", path: hit };

  return polisSingleflight(`preview-thumb:${params.scope}:${thumbKey}`, async () => {
    const raced = await previewCachedPath(params.scope, thumbKey, PREVIEW_THUMB_EXT, params.ttlMs);
    if (raced) return { source: "disk" as const, path: raced };
    const full = await params.loadFull();
    if (!full) return null;
    const thumb = await resizePreviewThumb(full.image, params.width);
    if (full.cacheable) {
      await writePreviewCache(params.scope, thumbKey, PREVIEW_THUMB_EXT, thumb).catch((error: unknown) =>
        console.warn("[polis] preview thumbnail cache write failed", error),
      );
    }
    return { source: "buffer" as const, image: thumb, cacheable: full.cacheable };
  });
}

export async function cachedPreviewThumbExists(
  scope: string,
  fullKey: string,
  width: PreviewThumbWidth,
  ttlMs?: number,
): Promise<boolean> {
  return (await previewCachedPath(scope, previewThumbCacheKey(fullKey, width), PREVIEW_THUMB_EXT, ttlMs)) != null;
}
