import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resolveDemoRenderDiskCachePath,
  writeDemoRenderDiskCache,
} from "@/lib/demo-render-disk-cache";
import {
  linkPolisDiskCacheAlias,
  readPolisDiskBytes,
  resolvePolisDiskCachePath,
  sweepPolisDiskCache,
  writePolisDiskBytes,
} from "@/lib/polis-disk-cache";

const DAY_MS = 24 * 60 * 60 * 1000;
let root = "";
const savedEnv = { ...process.env };

async function age(namespace: string, key: string, ext: string, days: number) {
  const file = (await resolvePolisDiskCachePath(namespace, "g", key, ext))!;
  const when = new Date(Date.now() - days * DAY_MS);
  await utimes(file, when, when);
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-cache-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_MAX_BYTES;
  delete process.env.POLIS_CACHE_MAX_AGE_DAYS;
  delete process.env.POLIS_CACHE_DISABLE;
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

describe("polis disk cache", () => {
  test("writes replace the file whole and leave no temp files", async () => {
    await writePolisDiskBytes("poster", "g", "k", ".webp", Buffer.from("first"));
    await writePolisDiskBytes("poster", "g", "k", ".webp", Buffer.from("second"));
    expect((await readPolisDiskBytes("poster", "g", "k", ".webp"))?.toString()).toBe("second");
    expect((await listFiles(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  test("an alias shares the file and survives a rewrite of the source", async () => {
    await writePolisDiskBytes("poster", "g", "k", ".webp", Buffer.from("v1"));
    await linkPolisDiskCacheAlias("poster", "g", "k", "latest", ".webp");
    const source = (await resolvePolisDiskCachePath("poster", "g", "k", ".webp"))!;
    const alias = (await resolvePolisDiskCachePath("poster", "g", "latest", ".webp"))!;
    expect((await stat(alias)).ino).toBe((await stat(source)).ino);

    await writePolisDiskBytes("poster", "g", "k", ".webp", Buffer.from("v2"));
    expect((await readPolisDiskBytes("poster", "g", "latest", ".webp"))?.toString()).toBe("v1");
  });

  test("the sweep removes files past the max age and keeps recent ones", async () => {
    await writePolisDiskBytes("poster", "g", "old", ".webp", Buffer.from("old"));
    await writePolisDiskBytes("poster", "g", "new", ".webp", Buffer.from("new"));
    await age("poster", "old", ".webp", 46);

    expect((await sweepPolisDiskCache()).removed).toBe(1);
    expect(await resolvePolisDiskCachePath("poster", "g", "old", ".webp")).toBeNull();
    expect(await resolvePolisDiskCachePath("poster", "g", "new", ".webp")).not.toBeNull();
  });

  test("the byte cap drops the oldest writes and counts aliases once", async () => {
    process.env.POLIS_CACHE_MAX_BYTES = "10";
    await writePolisDiskBytes("poster", "g", "a", ".webp", Buffer.alloc(6));
    await linkPolisDiskCacheAlias("poster", "g", "a", "a-latest", ".webp");
    await writePolisDiskBytes("poster", "g", "b", ".webp", Buffer.alloc(4));
    await age("poster", "a", ".webp", 2);
    expect((await sweepPolisDiskCache()).removed).toBe(0);

    await writePolisDiskBytes("poster", "g", "c", ".webp", Buffer.alloc(4));
    await sweepPolisDiskCache();
    expect(await resolvePolisDiskCachePath("poster", "g", "a", ".webp")).toBeNull();
    expect(await resolvePolisDiskCachePath("poster", "g", "a-latest", ".webp")).toBeNull();
    expect(await resolvePolisDiskCachePath("poster", "g", "c", ".webp")).not.toBeNull();
  });

  test("demo renders live under the cache root and the sweep removes old ones", async () => {
    await writeDemoRenderDiskCache("old-demo", Buffer.from("old"));
    await writeDemoRenderDiskCache("new-demo", Buffer.from("new"));
    const oldFile = (await resolveDemoRenderDiskCachePath("old-demo"))!;
    expect(oldFile.startsWith(root)).toBe(true);
    const when = new Date(Date.now() - 46 * DAY_MS);
    await utimes(oldFile, when, when);

    expect((await sweepPolisDiskCache()).removed).toBe(1);
    expect(await resolveDemoRenderDiskCachePath("old-demo")).toBeNull();
    expect(await resolveDemoRenderDiskCachePath("new-demo")).not.toBeNull();
  });
});
