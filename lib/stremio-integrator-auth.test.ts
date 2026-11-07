import { afterEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import type { StoredPolisConfig } from "@/lib/polis-config-store";
import { resolvePolisIntegratorAuth, serverKeyProfileFor } from "@/lib/stremio-integrator-auth";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
});

const config: StoredPolisConfig = {
  id: "cfg1",
  label: null,
  posterQuery: "",
  manifestKind: "full",
  catalogs: [],
  tmdbIntegratorSecret: null,
  mdblistIntegratorKey: "profile-key",
  hasPassword: false,
  createdAt: 0,
  updatedAt: 0,
};

function source(url: string, withConfig: boolean) {
  return resolvePolisIntegratorAuth(new NextRequest(url), withConfig ? config : null).mdblistKeySource;
}

describe("mdblist key source", () => {
  test("labels request, server and profile keys", () => {
    process.env.MDBLIST_API_KEY = "server-key";
    expect(source("http://polis.test/p?mdblist_key=req", true)).toBe("request");
    expect(source("http://polis.test/p", true)).toBe("server");
    delete process.env.MDBLIST_API_KEY;
    expect(source("http://polis.test/p", true)).toBe("profile");
    expect(source("http://polis.test/p", false)).toBeNull();
  });

  test("only server keys used by a saved profile are charged to its share", () => {
    expect(serverKeyProfileFor("server", "cfg1")).toBe("cfg1");
    expect(serverKeyProfileFor("server", null)).toBeNull();
    expect(serverKeyProfileFor("profile", "cfg1")).toBeNull();
    expect(serverKeyProfileFor("request", null)).toBeNull();
  });
});
