import { demoPosterCacheKey, overlayQueryStringFromRaw } from "@/lib/demo-poster-query";
import {
  readDemoRenderDiskCache,
  resolveDemoRenderDiskCachePath,
  writeDemoRenderDiskCache,
} from "@/lib/demo-render-disk-cache";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { parsePosterOverlayQuery } from "@/lib/poster-query";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { renderDemoPosterJpeg } from "@/lib/render-demo-poster";

type Entry = { jpeg: Buffer; at: number };

const memory = new Map<string, Entry>();

function demoMemoryCacheMax(): number | null {
  return polisEnvPositiveInt("POLIS_CACHE_MEMORY_DEMO_POSTERS");
}

function demoMemoryCacheTtlMs(): number | null {
  const sec = polisEnvPositiveInt("POLIS_CACHE_MEMORY_DEMO_POSTERS_TTL_SEC");
  return sec != null ? sec * 1000 : null;
}

function cacheKey(demoId: string, rawQueryString: string): string {
  return `${POLIS_RENDERER_REVISION}:${demoPosterCacheKey(demoId, rawQueryString)}`;
}

function prune(max: number): void {
  const ttlMs = demoMemoryCacheTtlMs();
  const now = Date.now();
  if (ttlMs != null) {
    for (const [key, entry] of memory) {
      if (now - entry.at > ttlMs) memory.delete(key);
    }
  }
  if (memory.size <= max) return;
  const oldest = [...memory.entries()].sort((a, b) => a[1].at - b[1].at);
  for (let i = 0; i < oldest.length - max; i++) {
    memory.delete(oldest[i][0]);
  }
}

function remember(key: string, jpeg: Buffer): void {
  const max = demoMemoryCacheMax();
  if (max == null) return;
  memory.set(key, { jpeg, at: Date.now() });
  prune(max);
}

function memoryHit(key: string): Buffer | null {
  const max = demoMemoryCacheMax();
  if (max == null) return null;
  const hit = memory.get(key);
  if (!hit) return null;
  const ttlMs = demoMemoryCacheTtlMs();
  if (ttlMs != null && Date.now() - hit.at > ttlMs) {
    memory.delete(key);
    return null;
  }
  return hit.jpeg;
}

export async function renderDemoPosterJpegCached(
  demoId: string,
  rawQueryString: string,
): Promise<Buffer | null> {
  const key = cacheKey(demoId, rawQueryString);

  const mem = memoryHit(key);
  if (mem) return mem;

  const diskPath = await resolveDemoRenderDiskCachePath(key);
  if (diskPath) {
    const disk = await readDemoRenderDiskCache(key);
    return disk;
  }

  const jpeg = await polisSingleflight(`demo:${key}`, async () => {
    const racedPath = await resolveDemoRenderDiskCachePath(key);
    if (racedPath) return readDemoRenderDiskCache(key);

    const overlay = parsePosterOverlayQuery(
      new URLSearchParams(overlayQueryStringFromRaw(rawQueryString)),
    );
    const rendered = await renderDemoPosterJpeg(demoId, overlay);
    if (!rendered) return null;
    void writeDemoRenderDiskCache(key, rendered).catch(() => {});
    remember(key, rendered);
    return rendered;
  });

  return jpeg;
}
