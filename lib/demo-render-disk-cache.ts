import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { posterDiskExtension } from "@/lib/poster-output-format";

const CACHE_ROOT = path.join(process.cwd(), ".cache/demo-rendered");

function filePath(cacheKey: string): string {
  const hash = createHash("sha256").update(cacheKey).digest("hex");
  return path.join(CACHE_ROOT, `${hash}${posterDiskExtension()}`);
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
  await mkdir(CACHE_ROOT, { recursive: true });
  await writeFile(filePath(cacheKey), image);
}
