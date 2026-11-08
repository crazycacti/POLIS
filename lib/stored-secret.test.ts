import { afterEach, describe, expect, it } from "bun:test";

import { getPolisDb } from "@/lib/db";
import { createPolisConfig, getPolisConfig } from "@/lib/polis-config-store";
import { parsePosterOverlayQuery } from "@/lib/poster-query";
import { isSealedSecret, openSecret, sealSecret } from "@/lib/stored-secret";

const savedDataKey = process.env.POLIS_DATA_KEY;

afterEach(() => {
  if (savedDataKey === undefined) delete process.env.POLIS_DATA_KEY;
  else process.env.POLIS_DATA_KEY = savedDataKey;
});

describe("stored api keys", () => {
  it("round-trips and never stores the plain key", () => {
    const sealed = sealSecret("stored-key-test-value-123");
    expect(isSealedSecret(sealed)).toBe(true);
    expect(sealed).not.toContain("stored-key-test-value-123");
    expect(openSecret(sealed)).toBe("stored-key-test-value-123");
    expect(sealSecret("stored-key-test-value-123")).not.toBe(sealed);
  });

  it("reads legacy plain values and returns null when the key changed", () => {
    expect(openSecret("legacy-plain-key")).toBe("legacy-plain-key");
    process.env.POLIS_DATA_KEY = "first-data-key-for-test";
    const sealed = sealSecret("rotating-key-value");
    process.env.POLIS_DATA_KEY = "second-data-key-for-test";
    const realWarn = console.warn;
    console.warn = () => {};
    try {
      expect(openSecret(sealed)).toBeNull();
    } finally {
      console.warn = realWarn;
    }
  });

  it("encrypts keys in the database and seals old plain rows on read", () => {
    const created = createPolisConfig({
      overlay: parsePosterOverlayQuery(new URLSearchParams()),
      integrator: { tmdbSecret: "tmdb-at-rest-test", mdblistApiKey: "mdblist-at-rest-test" },
      passwordHash: "scrypt:a:b",
    });
    const db = getPolisDb();
    const raw = () =>
      db
        .query<{ t: string; m: string }, [string]>(
          "SELECT tmdb_integrator_secret AS t, mdblist_integrator_key AS m FROM user_configs WHERE id = ?",
        )
        .get(created.id)!;
    expect(isSealedSecret(raw().t)).toBe(true);
    expect(isSealedSecret(raw().m)).toBe(true);
    expect(getPolisConfig(created.id)?.tmdbIntegratorSecret).toBe("tmdb-at-rest-test");

    db.query("UPDATE user_configs SET mdblist_integrator_key = ? WHERE id = ?").run("legacy-plain-mdblist", created.id);
    expect(getPolisConfig(created.id)?.mdblistIntegratorKey).toBe("legacy-plain-mdblist");
    expect(isSealedSecret(raw().m)).toBe(true);
  });
});
