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
  test("uses the request key, then the profile key, then the server key", () => {
    process.env.MDBLIST_API_KEY = "server-key";
    expect(source("http://polis.test/p?mdblist_key=req", true)).toBe("request");
    expect(source("http://polis.test/p", true)).toBe("profile");
    expect(source("http://polis.test/p", false)).toBe("server");
    delete process.env.MDBLIST_API_KEY;
    expect(source("http://polis.test/p", false)).toBeNull();
  });

  test("never offers the server key for watchlists and lists", () => {
    process.env.MDBLIST_API_KEY = "server-key";
    const anonymous = resolvePolisIntegratorAuth(new NextRequest("http://polis.test/p"), null);
    expect(anonymous.mdblistApiKey).toBe("server-key");
    expect(anonymous.mdblistAccountApiKey).toBeNull();
    const profile = resolvePolisIntegratorAuth(new NextRequest("http://polis.test/p"), config);
    expect(profile.mdblistAccountApiKey).toBe("profile-key");
  });

  test("server keys are charged to the profile's share, or to one shared anonymous share", () => {
    expect(serverKeyProfileFor("server", "cfg1")).toBe("cfg1");
    expect(serverKeyProfileFor("server", null)).toBe("anonymous");
    expect(serverKeyProfileFor("profile", "cfg1")).toBeNull();
    expect(serverKeyProfileFor("request", null)).toBeNull();
  });
});
