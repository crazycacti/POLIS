import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { polisCacheScope } from "@/lib/polis-cache-path";
import {
  polisArtworkDiskTtlMs,
  readPolisDiskBytes,
  resolvePolisDiskCachePath,
  writePolisDiskBytes,
} from "@/lib/polis-disk-cache";
import { withPolisRenderLimit } from "@/lib/polis-render-limit";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { renderBackdropJpeg } from "@/lib/render-backdrop-default";
import { renderLogoPng } from "@/lib/render-logo-default";

function backdropCacheKey(imdbId: string, language: string, configId: string | null): string {
  return [String(POLIS_RENDERER_REVISION), "backdrop", configId?.trim() || "_", language, imdbId].join(
    "\0",
  );
}

function logoCacheKey(imdbId: string, language: string, configId: string | null): string {
  return [String(POLIS_RENDERER_REVISION), "logo", configId?.trim() || "_", language, imdbId].join("\0");
}

export async function resolveCachedBackdropDiskPath(
  imdbId: string,
  language: string,
  configId: string | null,
): Promise<string | null> {
  const cacheKey = backdropCacheKey(imdbId, language, configId);
  return resolvePolisDiskCachePath("backdrop", polisCacheScope(configId), cacheKey, ".jpg", polisArtworkDiskTtlMs());
}

export async function resolveCachedLogoDiskPath(
  imdbId: string,
  language: string,
  configId: string | null,
): Promise<string | null> {
  const cacheKey = logoCacheKey(imdbId, language, configId);
  return resolvePolisDiskCachePath("logo", polisCacheScope(configId), cacheKey, ".png", polisArtworkDiskTtlMs());
}

export async function renderBackdropJpegCached(
  backdropPath: string,
  imdbId: string,
  language: string,
  configId: string | null,
): Promise<Buffer | null> {
  const cacheKey = backdropCacheKey(imdbId, language, configId);
  const scope = polisCacheScope(configId);
  const ttlMs = polisArtworkDiskTtlMs();
  const cached = await readPolisDiskBytes("backdrop", scope, cacheKey, ".jpg", ttlMs);
  if (cached) return cached;

  return polisSingleflight(`backdrop:${scope}:${cacheKey}`, async () => {
    const raced = await readPolisDiskBytes("backdrop", scope, cacheKey, ".jpg", ttlMs);
    if (raced) return raced;

    const jpeg = await renderBackdropJpeg(backdropPath, withPolisRenderLimit);
    if (!jpeg) return null;
    void writePolisDiskBytes("backdrop", scope, cacheKey, ".jpg", jpeg).catch(() => {});
    return jpeg;
  });
}

export async function renderLogoPngCached(
  logoPath: string,
  imdbId: string,
  language: string,
  configId: string | null,
): Promise<Buffer | null> {
  const cacheKey = logoCacheKey(imdbId, language, configId);
  const scope = polisCacheScope(configId);
  const ttlMs = polisArtworkDiskTtlMs();
  const cached = await readPolisDiskBytes("logo", scope, cacheKey, ".png", ttlMs);
  if (cached) return cached;

  return polisSingleflight(`logo:${scope}:${cacheKey}`, async () => {
    const raced = await readPolisDiskBytes("logo", scope, cacheKey, ".png", ttlMs);
    if (raced) return raced;

    const png = await renderLogoPng(logoPath, "original", withPolisRenderLimit);
    if (!png) return null;
    void writePolisDiskBytes("logo", scope, cacheKey, ".png", png).catch(() => {});
    return png;
  });
}
