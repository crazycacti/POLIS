import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import sharp from "sharp";

import { GET } from "@/app/demo/poster/[id]/route";
import { DEMO_TITLES } from "@/lib/demo-catalog";
import { DEMO_THUMB_STORE, TITLE_PREVIEW_STORE } from "@/lib/preview-image-cache";

const DEMO_ID = DEMO_TITLES[0]!.id;
let root = "";
const savedEnv = { ...process.env };

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-demo-thumb-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

function demo(query: string, headers: Record<string, string> = {}) {
  return GET(new NextRequest(`http://polis.test/demo/poster/${DEMO_ID}.jpg?${query}`, { headers }), {
    params: Promise.resolve({ id: `${DEMO_ID}.jpg` }),
  });
}

describe("demo poster thumbnails", () => {
  test("serves a webp thumbnail at an allowed width and revalidates it", async () => {
    const response = await demo("trend=0&w=320");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta.width).toBe(320);

    const etag = response.headers.get("etag");
    expect(etag).toBeTruthy();
    expect((await demo("trend=0&w=320", { "if-none-match": etag! })).status).toBe(304);
  });

  test("stores demo thumbnails apart from title previews", async () => {
    expect((await demo("trend=0&genre=1&w=160")).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const entries = await readdir(root);
    expect(entries).toContain(DEMO_THUMB_STORE.namespace);
    expect(entries).not.toContain(TITLE_PREVIEW_STORE.namespace);
  });

  test("rejects widths outside the allowed set", async () => {
    expect((await demo("w=999")).status).toBe(400);
    expect((await demo("w=160.5")).status).toBe(400);
  });

  test("keeps the full-size poster when no width is given", async () => {
    const response = await demo("trend=0");
    expect(response.status).toBe(200);
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta.width).toBeGreaterThan(320);
  });
});
