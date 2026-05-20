import { describe, expect, test } from "bun:test";

import {
  formatPolisManifestName,
  normalizeConfigLabel,
} from "@/lib/polis-config-label";

describe("normalizeConfigLabel", () => {
  test("accepts User N style names", () => {
    expect(normalizeConfigLabel("User 1")).toBe("User 1");
    expect(normalizeConfigLabel("  User 2  ")).toBe("User 2");
  });

  test("rejects empty and symbols", () => {
    expect(normalizeConfigLabel("")).toBeNull();
    expect(normalizeConfigLabel("bad/name")).toBeNull();
  });
});

describe("formatPolisManifestName", () => {
  test("always uses POLIS for Stremio addon name", () => {
    expect(formatPolisManifestName("User 1")).toBe("POLIS");
    expect(formatPolisManifestName(null)).toBe("POLIS");
  });
});
