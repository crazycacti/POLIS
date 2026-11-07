import { describe, expect, it } from "bun:test";

import { MDBLIST_WATCHLIST_PRESETS, TMDB_CATALOG_PRESETS } from "@/lib/catalog-presets";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import {
  hasUnsavedSetupChanges,
  NO_KEY_CHANGES,
  setupIntegratorPatch,
  setupKeyChanges,
  setupSnapshot,
} from "@/lib/setup-dirty-state";

describe("setupSnapshot", () => {
  const a = TMDB_CATALOG_PRESETS[0]!;
  const b = MDBLIST_WATCHLIST_PRESETS[1]!;

  it("matches for equal content with different key order", () => {
    const reordered: PolisCatalogDefinition = {
      provider: { list: "trending", kind: "tmdb" },
      name: a.name,
      type: a.type,
      id: a.id,
    };
    expect(setupSnapshot("rating=1", [reordered])).toBe(setupSnapshot("rating=1", [a]));
  });

  it("changes when catalog order changes", () => {
    expect(setupSnapshot("", [a, b])).not.toBe(setupSnapshot("", [b, a]));
  });

  it("changes when the poster query changes", () => {
    expect(setupSnapshot("rating=1", [a])).not.toBe(setupSnapshot("rating=0", [a]));
  });

  it("distinguishes mdblist list ids", () => {
    const list = (listId: string): PolisCatalogDefinition => ({
      id: "mdblist-list-movie",
      type: "movie",
      name: "List",
      provider: { kind: "mdblist", list: "list", listId },
    });
    expect(setupSnapshot("", [list("1")])).not.toBe(setupSnapshot("", [list("2")]));
  });
});

describe("hasUnsavedSetupChanges", () => {
  it("is false before a baseline exists", () => {
    expect(hasUnsavedSetupChanges(null, setupSnapshot("", []))).toBe(false);
  });

  it("compares against the baseline", () => {
    const base = setupSnapshot("x=1", []);
    expect(hasUnsavedSetupChanges(base, base)).toBe(false);
    expect(hasUnsavedSetupChanges(base, setupSnapshot("x=2", []))).toBe(true);
  });
});

describe("setupKeyChanges", () => {
  const sent = { tmdb: "tmdb-a", mdblist: "mdb-a" };

  it("ignores inputs that match what was sent, after trimming", () => {
    expect(setupKeyChanges({ tmdb: " tmdb-a ", mdblist: "mdb-a" }, sent)).toEqual(NO_KEY_CHANGES);
  });

  it("flags a non-empty input that differs from what was sent", () => {
    expect(setupKeyChanges({ tmdb: "tmdb-b", mdblist: "mdb-a" }, sent)).toEqual({
      tmdb: true,
      mdblist: false,
    });
    expect(setupKeyChanges({ tmdb: "tmdb-a", mdblist: "mdb-b" }, sent)).toEqual({
      tmdb: false,
      mdblist: true,
    });
  });

  it("does not flag a cleared input", () => {
    expect(setupKeyChanges({ tmdb: "  ", mdblist: "" }, sent)).toEqual(NO_KEY_CHANGES);
  });

  it("flags a key removed from the profile until a new key replaces it", () => {
    const removed = { tmdb: false, mdblist: true };
    expect(setupKeyChanges({ tmdb: "tmdb-a", mdblist: "" }, sent, removed)).toEqual({
      tmdb: false,
      mdblist: true,
    });
    expect(setupKeyChanges({ tmdb: "tmdb-a", mdblist: "mdb-a" }, sent, removed)).toEqual(
      NO_KEY_CHANGES,
    );
  });

  it("flags a first key when nothing was sent", () => {
    expect(setupKeyChanges({ tmdb: "tmdb-a", mdblist: "" }, { tmdb: "", mdblist: "" })).toEqual({
      tmdb: true,
      mdblist: false,
    });
  });
});

describe("setupSnapshot key changes", () => {
  it("marks the snapshot dirty when a key input changed", () => {
    const base = setupSnapshot("x=1", []);
    const changed = setupSnapshot("x=1", [], { tmdb: true, mdblist: false });
    expect(hasUnsavedSetupChanges(base, changed)).toBe(true);
    expect(hasUnsavedSetupChanges(base, setupSnapshot("x=1", [], NO_KEY_CHANGES))).toBe(false);
  });

  it("never contains key values", () => {
    const snapshot = setupSnapshot(
      "x=1",
      [],
      setupKeyChanges({ tmdb: "secret-tmdb", mdblist: "secret-mdb" }, { tmdb: "", mdblist: "" }),
    );
    expect(snapshot).not.toContain("secret-tmdb");
    expect(snapshot).not.toContain("secret-mdb");
  });
});

describe("setupIntegratorPatch", () => {
  it("sends trimmed browser keys", () => {
    expect(setupIntegratorPatch({ tmdb: " t ", mdblist: "m" }, NO_KEY_CHANGES)).toEqual({
      tmdbSecret: "t",
      mdblistApiKey: "m",
    });
  });

  it("leaves profile keys alone when the browser has none", () => {
    expect(setupIntegratorPatch({ tmdb: "", mdblist: "" }, NO_KEY_CHANGES)).toEqual({});
  });

  it("clears a profile key the user removed", () => {
    expect(setupIntegratorPatch({ tmdb: "", mdblist: "" }, { tmdb: true, mdblist: false })).toEqual({
      tmdbSecret: null,
    });
  });

  it("sends a replacement key instead of clearing", () => {
    expect(setupIntegratorPatch({ tmdb: "new", mdblist: "" }, { tmdb: true, mdblist: false })).toEqual({
      tmdbSecret: "new",
    });
  });
});
