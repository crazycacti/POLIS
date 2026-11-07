import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ifNoneMatchHits, imageResponse } from "@/lib/cached-file-response";

const HEADERS = {
  "Content-Type": "image/webp",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
};
const IMAGE_URL = "https://polis.example/poster/imdb/poster-default/tt0111161.jpg";

const CTIME_TICK_MS = 20;
const MS_PER_SECOND = 1000;

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-etag-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function request(ifNoneMatch?: string): Request {
  return new Request(IMAGE_URL, ifNoneMatch ? { headers: { "If-None-Match": ifNoneMatch } } : {});
}

describe("imageResponse", () => {
  test("a disk copy and a fresh buffer with the same bytes share one ETag", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = path.join(root, "poster.webp");
    await writeFile(file, bytes);

    const fromDisk = await imageResponse(request(), { path: file }, HEADERS);
    const fromBuffer = await imageResponse(request(), { bytes }, HEADERS);

    expect(fromDisk.status).toBe(200);
    expect(new Uint8Array(await fromDisk.arrayBuffer())).toEqual(bytes);
    expect(fromDisk.headers.get("etag")).toMatch(/^"[A-Za-z0-9_-]+"$/);
    expect(fromDisk.headers.get("etag")).toBe(fromBuffer.headers.get("etag"));
    expect(fromDisk.headers.get("cache-control")).toBe(HEADERS["Cache-Control"]);
  });

  test("answers a matching If-None-Match with an empty 304 that keeps caching and CORS headers", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const etag = (await imageResponse(request(), { bytes }, HEADERS)).headers.get("etag")!;

    const revalidated = await imageResponse(request(`W/${etag}`), { bytes }, HEADERS);

    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");
    expect(revalidated.headers.get("etag")).toBe(etag);
    expect(revalidated.headers.get("cache-control")).toBe(HEADERS["Cache-Control"]);
    expect(revalidated.headers.get("access-control-allow-origin")).toBe("*");
    expect(revalidated.headers.get("content-type")).toBeNull();
  });

  test("revalidates a disk copy repeatedly and picks up a replaced file", async () => {
    const file = path.join(root, "poster.webp");
    await writeFile(file, new Uint8Array([1, 1, 1]));
    const first = await imageResponse(request(), { path: file }, HEADERS);
    const firstTag = first.headers.get("etag") ?? "";

    const again = await imageResponse(request(firstTag), { path: file }, HEADERS);
    expect(again.status).toBe(304);
    expect(again.headers.get("etag")).toBe(firstTag);

    const replacement = path.join(root, "poster.webp.tmp");
    await writeFile(replacement, new Uint8Array([2, 2, 2, 2]));
    await rename(replacement, file);

    const replaced = await imageResponse(request(firstTag), { path: file }, HEADERS);
    expect(replaced.status).toBe(200);
    expect(new Uint8Array(await replaced.arrayBuffer())).toEqual(new Uint8Array([2, 2, 2, 2]));
    expect(replaced.headers.get("etag")).toBe(
      (await imageResponse(request(), { bytes: new Uint8Array([2, 2, 2, 2]) }, HEADERS)).headers.get("etag"),
    );
  });

  test("rehashes a file rewritten in place with the same size and mtime", async () => {
    const file = path.join(root, "poster.webp");
    await writeFile(file, new Uint8Array([3, 3, 3]));
    const before = await stat(file);
    const firstTag = (await imageResponse(request(), { path: file }, HEADERS)).headers.get("etag") ?? "";

    await new Promise((resolve) => setTimeout(resolve, CTIME_TICK_MS));
    await writeFile(file, new Uint8Array([4, 4, 4]));
    await utimes(file, before.atimeMs / MS_PER_SECOND, before.mtimeMs / MS_PER_SECOND);
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);

    const rewritten = await imageResponse(request(firstTag), { path: file }, HEADERS);
    expect(rewritten.status).toBe(200);
    expect(new Uint8Array(await rewritten.arrayBuffer())).toEqual(new Uint8Array([4, 4, 4]));
  });

  test("sends the full image when the client holds an older version", async () => {
    const response = await imageResponse(request('"stale-tag"'), { bytes: new Uint8Array([5]) }, HEADERS);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([5]));
  });
});

describe("ifNoneMatchHits", () => {
  test("matches any listed tag, weak or strong, and the wildcard", () => {
    expect(ifNoneMatchHits('"a", "b"', '"b"')).toBe(true);
    expect(ifNoneMatchHits('W/"b"', '"b"')).toBe(true);
    expect(ifNoneMatchHits("*", '"b"')).toBe(true);
    expect(ifNoneMatchHits('"a"', '"b"')).toBe(false);
    expect(ifNoneMatchHits(null, '"b"')).toBe(false);
  });
});
