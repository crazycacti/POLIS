import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { polisCacheRoot } from "@/lib/polis-cache-path";
import { posterDiskExtension } from "@/lib/poster-output-format";

const DEMO_RENDER_CACHE_DIR = "demo-rendered";

function demoRenderCacheRoot(): string {
  return path.join(polisCacheRoot(), DEMO_RENDER_CACHE_DIR);
}

function filePath(cacheKey: string): string {
  const hash = createHash("sha256").update(cacheKey).digest("hex");
  return path.join(demoRenderCacheRoot(), `${hash}${posterDiskExtension()}`);
}

export async function resolveDemoRenderDiskCachePath(cacheKey: string): Promise<string | null> {
  const file = filePath(cacheKey);
  try {
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

export async function readDemoRenderDiskCache(cacheKey: string): Promise<Buffer | null> {
  const file = await resolveDemoRenderDiskCachePath(cacheKey);
  if (!file) return null;
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

export async function writeDemoRenderDiskCache(cacheKey: string, image: Buffer): Promise<void> {
  await mkdir(demoRenderCacheRoot(), { recursive: true });
  await writeFile(filePath(cacheKey), image);
}
