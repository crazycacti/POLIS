import { describe, expect, test } from "bun:test";

import {
  parseCatalogSkip,
  parseStremioCatalogExtra,
} from "@/lib/stremio-catalog-extra";

describe("parseStremioCatalogExtra", () => {
  test("merges path skip with query", () => {
    const extra = parseStremioCatalogExtra(
      ["skip=100"],
      new URLSearchParams("genre=action"),
    );
    expect(extra.get("skip")).toBe("100");
    expect(extra.get("genre")).toBe("action");
  });

  test("strips .json from path segment", () => {
    const extra = parseStremioCatalogExtra(["skip=0.json"], new URLSearchParams());
    expect(parseCatalogSkip(extra)).toBe(0);
  });

  test("parses combined extra segment", () => {
    const extra = parseStremioCatalogExtra(
      ["search=foo&skip=200"],
      new URLSearchParams(),
    );
    expect(extra.get("search")).toBe("foo");
    expect(parseCatalogSkip(extra)).toBe(200);
  });
});
