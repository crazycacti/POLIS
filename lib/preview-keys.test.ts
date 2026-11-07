import { describe, expect, test } from "bun:test";

import { withPreviewRetry, withPreviewRetrySrcSet } from "@/components/setup/use-preview-fallbacks";
import {
  NO_PREVIEW_CALLER_KEYS,
  parsePreviewKeysCookie,
  previewKeySetHash,
  serializePreviewKeysCookie,
} from "@/lib/preview-keys";

const KEY_A = "0123456789abcdef0123456789abcdef";
const KEY_B = "fedcba9876543210fedcba9876543210";

describe("preview key set hash", () => {
  test("changes when a key is replaced and stays stable for the same keys", async () => {
    const first = await previewKeySetHash({ ...NO_PREVIEW_CALLER_KEYS, tmdb: KEY_A });
    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(await previewKeySetHash({ ...NO_PREVIEW_CALLER_KEYS, tmdb: KEY_A })).toBe(first);
    expect(await previewKeySetHash({ ...NO_PREVIEW_CALLER_KEYS, tmdb: KEY_B })).not.toBe(first);
    expect(first).not.toContain(KEY_A.slice(0, 8));
  });

  test("marks an empty key set without hashing", async () => {
    expect(await previewKeySetHash(NO_PREVIEW_CALLER_KEYS)).toBe("none");
  });
});

describe("preview keys cookie", () => {
  test("round-trips keys and drops oversized or malformed values", () => {
    const keys = { tmdb: KEY_A, mdblist: "m", fanart: null, tvdb: null };
    expect(parsePreviewKeysCookie(serializePreviewKeysCookie(keys))).toEqual(keys);
    expect(parsePreviewKeysCookie(JSON.stringify({ t: "x".repeat(2000) })).tmdb).toBeNull();
    expect(parsePreviewKeysCookie("{not json")).toEqual(NO_PREVIEW_CALLER_KEYS);
  });
});

describe("preview retry urls", () => {
  test("adds the retry marker to a url and to every srcset candidate", () => {
    expect(withPreviewRetry("/preview/poster/tt1.webp?w=160")).toBe("/preview/poster/tt1.webp?w=160&retry=1");
    expect(withPreviewRetrySrcSet("/a?w=160 160w, /a?w=320 320w")).toBe("/a?w=160&retry=1 160w, /a?w=320&retry=1 320w");
  });
});
