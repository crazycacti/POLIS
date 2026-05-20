import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { polisCacheRoot } from "@/lib/polis-cache-path";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";

function cacheEnabled(): boolean {
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
  if (!cacheEnabled()) return null;
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
    return await readFile(file);
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
  if (!cacheEnabled()) return;
  const file = filePath(namespace, scope, cacheKey, ext);
  await ensureParent(file);
  await writeFile(file, data);
  void enforceCacheSizeLimit().catch(() => {});
}

export async function readPolisDiskJson<T>(
  namespace: string,
  scope: string,
  cacheKey: string,
  ttlMs: number,
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

async function listCacheFiles(dir: string): Promise<{ path: string; mtimeMs: number; size: number }[]> {
  const out: { path: string; mtimeMs: number; size: number }[] = [];
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
      out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size });
    } catch {}
  }
  return out;
}

async function enforceCacheSizeLimit(): Promise<void> {
  const max = polisEnvPositiveInt("POLIS_CACHE_MAX_BYTES");
  if (max == null) return;

  const root = polisCacheRoot();
  const files = await listCacheFiles(root);
  let total = files.reduce((sum, f) => sum + f.size, 0);
  if (total <= max) return;

  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const file of files) {
    if (total <= max) break;
    try {
      await rm(file.path);
      total -= file.size;
    } catch {}
  }
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
      } catch {}
    }),
  );
}
