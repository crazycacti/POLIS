import { createHash, randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import { link, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { polisCacheRoot } from "@/lib/polis-cache-path";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_MAX_AGE_DAYS = 45;
const CACHE_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const TEMP_SUFFIX = ".tmp";

let lastSweepAt = 0;
let sweepInFlight: Promise<void> | null = null;

export function polisDiskCacheEnabled(): boolean {
  return process.env.POLIS_CACHE_DISABLE !== "1";
}

function filePath(namespace: string, scope: string, cacheKey: string, ext: string): string {
  const hash = createHash("sha256").update(`${namespace}\0${cacheKey}`).digest("hex");
  return path.join(polisCacheRoot(), namespace, scope, `${hash}${ext}`);
}

async function ensureParent(file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
}

export async function resolvePolisDiskCachePath(
  namespace: string,
  scope: string,
  cacheKey: string,
  ext: string,
  ttlMs?: number,
): Promise<string | null> {
  if (!polisDiskCacheEnabled()) return null;
  const file = filePath(namespace, scope, cacheKey, ext);
  try {
    const st = await stat(file);
    if (ttlMs != null && ttlMs > 0 && Date.now() - st.mtimeMs > ttlMs) return null;
    return file;
  } catch {
    return null;
  }
}

export async function readPolisDiskBytes(
  namespace: string,
  scope: string,
  cacheKey: string,
  ext: string,
  ttlMs?: number,
): Promise<Buffer | null> {
  const file = await resolvePolisDiskCachePath(namespace, scope, cacheKey, ext, ttlMs);
  if (!file) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ file);
  } catch {
    return null;
  }
}

export async function writePolisDiskBytes(
  namespace: string,
  scope: string,
  cacheKey: string,
  ext: string,
  data: Buffer,
): Promise<void> {
  if (!polisDiskCacheEnabled()) return;
  const file = filePath(namespace, scope, cacheKey, ext);
  await ensureParent(file);
  await replaceFile(file, (temp) => writeFile(temp, data));
  scheduleCacheSweep();
}

// Readers stream cache files while background refreshes rewrite them, so a file is only ever swapped in whole.
async function replaceFile(file: string, writeTemp: (temp: string) => Promise<void>): Promise<void> {
  const temp = `${file}.${randomBytes(6).toString("hex")}${TEMP_SUFFIX}`;
  try {
    await writeTemp(temp);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function linkPolisDiskCacheAlias(
  namespace: string,
  scope: string,
  cacheKey: string,
  aliasKey: string,
  ext: string,
): Promise<void> {
  if (!polisDiskCacheEnabled()) return;
  const source = filePath(namespace, scope, cacheKey, ext);
  await replaceFile(filePath(namespace, scope, aliasKey, ext), (temp) => link(source, temp));
}

export async function readPolisDiskJson<T>(
  namespace: string,
  scope: string,
  cacheKey: string,
  ttlMs?: number,
): Promise<T | null> {
  const raw = await readPolisDiskBytes(namespace, scope, cacheKey, ".json", ttlMs);
  if (!raw) return null;
  try {
    return JSON.parse(raw.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function writePolisDiskJson(
  namespace: string,
  scope: string,
  cacheKey: string,
  value: unknown,
): Promise<void> {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  await writePolisDiskBytes(namespace, scope, cacheKey, ".json", body);
}

type CacheFile = { path: string; mtimeMs: number; size: number; ino: number };

async function listCacheFiles(dir: string): Promise<CacheFile[]> {
  const out: CacheFile[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listCacheFiles(full)));
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const st = await stat(full);
      out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size, ino: st.ino });
    } catch {
      continue;
    }
  }
  return out;
}

function cacheMaxAgeMs(): number {
  return (polisEnvPositiveInt("POLIS_CACHE_MAX_AGE_DAYS") ?? DEFAULT_CACHE_MAX_AGE_DAYS) * DAY_MS;
}

function scheduleCacheSweep(): void {
  if (sweepInFlight || Date.now() - lastSweepAt < CACHE_SWEEP_INTERVAL_MS) return;
  lastSweepAt = Date.now();
  sweepInFlight = sweepPolisDiskCache()
    .then(() => undefined)
    .catch((error) => console.warn("[polis] cache sweep failed", error))
    .finally(() => {
      sweepInFlight = null;
    });
}

async function removeCacheFile(file: string): Promise<boolean> {
  try {
    await rm(file);
    return true;
  } catch {
    return false;
  }
}

export async function sweepPolisDiskCache(now = Date.now()): Promise<{ removed: number }> {
  const files = await listCacheFiles(polisCacheRoot());
  const maxAgeMs = cacheMaxAgeMs();
  let removed = 0;
  const kept: CacheFile[] = [];
  for (const file of files) {
    const abandonedTemp = file.path.endsWith(TEMP_SUFFIX) && now - file.mtimeMs > CACHE_SWEEP_INTERVAL_MS;
    if (abandonedTemp || now - file.mtimeMs > maxAgeMs) {
      if (await removeCacheFile(file.path)) removed += 1;
    } else {
      kept.push(file);
    }
  }

  const maxBytes = polisEnvPositiveInt("POLIS_CACHE_MAX_BYTES");
  if (maxBytes == null) return { removed };

  const links = new Map<number, number>();
  let total = 0;
  for (const file of kept) {
    const count = links.get(file.ino) ?? 0;
    if (count === 0) total += file.size;
    links.set(file.ino, count + 1);
  }
  if (total <= maxBytes) return { removed };

  kept.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const file of kept) {
    if (total <= maxBytes) break;
    if (!(await removeCacheFile(file.path))) continue;
    removed += 1;
    const left = (links.get(file.ino) ?? 1) - 1;
    links.set(file.ino, left);
    if (left === 0) total -= file.size;
  }
  return { removed };
}

export async function purgePolisConfigDiskCache(configId: string): Promise<void> {
  const id = configId.trim();
  if (!id) return;
  const scopeDir = path.join(polisCacheRoot());
  const namespaces = ["poster", "backdrop", "logo", "meta", "catalog", "tmdb"];
  await Promise.all(
    namespaces.map(async (ns) => {
      const dir = path.join(scopeDir, ns, `c/${id}`);
      try {
        await rm(dir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`[polis] cache purge failed for ${ns} of config ${id}`, error);
      }
    }),
  );
}
