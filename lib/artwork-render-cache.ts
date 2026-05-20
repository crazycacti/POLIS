import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { polisCacheScope } from "@/lib/polis-cache-path";
import {
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
  return resolvePolisDiskCachePath("backdrop", polisCacheScope(configId), cacheKey, ".jpg");
}

export async function resolveCachedLogoDiskPath(
  imdbId: string,
  language: string,
  configId: string | null,
): Promise<string | null> {
  const cacheKey = logoCacheKey(imdbId, language, configId);
  return resolvePolisDiskCachePath("logo", polisCacheScope(configId), cacheKey, ".png");
}

export async function renderBackdropJpegCached(
  backdropPath: string,
  imdbId: string,
  language: string,
  configId: string | null,
): Promise<Buffer | null> {
  const cacheKey = backdropCacheKey(imdbId, language, configId);
  const scope = polisCacheScope(configId);
  const diskPath = await resolvePolisDiskCachePath("backdrop", scope, cacheKey, ".jpg");
  if (diskPath) return readPolisDiskBytes("backdrop", scope, cacheKey, ".jpg");

  return polisSingleflight(`backdrop:${scope}:${cacheKey}`, async () => {
    const racedPath = await resolvePolisDiskCachePath("backdrop", scope, cacheKey, ".jpg");
    if (racedPath) return readPolisDiskBytes("backdrop", scope, cacheKey, ".jpg");

    const jpeg = await withPolisRenderLimit(() => renderBackdropJpeg(backdropPath));
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
  const diskPath = await resolvePolisDiskCachePath("logo", scope, cacheKey, ".png");
  if (diskPath) return readPolisDiskBytes("logo", scope, cacheKey, ".png");

  return polisSingleflight(`logo:${scope}:${cacheKey}`, async () => {
    const racedPath = await resolvePolisDiskCachePath("logo", scope, cacheKey, ".png");
    if (racedPath) return readPolisDiskBytes("logo", scope, cacheKey, ".png");

    const png = await withPolisRenderLimit(() => renderLogoPng(logoPath));
    if (!png) return null;
    void writePolisDiskBytes("logo", scope, cacheKey, ".png", png).catch(() => {});
    return png;
  });
}
