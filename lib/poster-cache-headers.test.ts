import { describe, expect, test } from "bun:test";

import { demoPosterHttpCacheControl, posterHttpCacheControl } from "@/lib/poster-cache-headers";

describe("poster Cache-Control outside development", () => {
  test("real posters stay fresh for six hours and may be served stale for a day", () => {
    expect(posterHttpCacheControl()).toBe(
      "public, max-age=21600, stale-while-revalidate=86400, stale-if-error=86400",
    );
  });

  test("demo posters keep their long lifetime", () => {
    expect(demoPosterHttpCacheControl()).toBe(
      "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400, immutable",
    );
  });
});
