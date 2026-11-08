import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";

const savedSecret = process.env.POLIS_SESSION_SECRET;

beforeAll(() => {
  process.env.POLIS_SESSION_SECRET = "test-session-secret-0123456789abcdef";
});

afterAll(() => {
  if (savedSecret == null) delete process.env.POLIS_SESSION_SECRET;
  else process.env.POLIS_SESSION_SECRET = savedSecret;
});

async function setup(withPassword: boolean) {
  const { getPolisDb } = await import("@/lib/db");
  expect(getPolisDb().filename.startsWith(tmpdir())).toBe(true);
  const store = await import("@/lib/polis-config-store");
  const auth = await import("@/lib/polis-config-auth");
  const { parsePosterOverlayQuery } = await import("@/lib/poster-query");
  const { POST } = await import("@/app/api/config/[configId]/rotate/route");
  const config = store.createPolisConfig({
    overlay: parsePosterOverlayQuery(new URLSearchParams()),
    integrator: { tmdbSecret: "rotate-test-tmdb" },
    passwordHash: withPassword ? await auth.hashConfigPassword("correct horse battery") : "",
  });
  const cookie = auth
    .configureSessionCookieHeader(auth.createConfigureSessionToken(config.id, store.getConfigPasswordHash(config.id)))
    .split(";")[0];
  const rotate = (withCookie: boolean, extra: Record<string, string> = {}) =>
    POST(
      new Request(`http://polis.test/api/config/${config.id}/rotate`, {
        method: "POST",
        headers: { ...(withCookie ? { cookie } : {}), ...extra },
      }),
      { params: Promise.resolve({ configId: config.id }) },
    );
  return { config, rotate, store };
}

describe("POST /api/config/[configId]/rotate", () => {
  test("moves the profile to a new id and retires the old one", async () => {
    const { config, rotate, store } = await setup(true);
    const response = await rotate(true);
    expect(response.status).toBe(200);
    const { configId } = (await response.json()) as { configId: string };
    expect(configId).not.toBe(config.id);
    expect(store.getPolisConfig(config.id)).toBeNull();
    expect(store.getPolisConfig(configId)?.tmdbIntegratorSecret).toBe("rotate-test-tmdb");
    expect(response.headers.get("set-cookie")).toContain(configId);
  });

  test("needs the profile's session", async () => {
    const { config, rotate, store } = await setup(true);
    expect((await rotate(false)).status).toBe(401);
    expect(store.getPolisConfig(config.id)).not.toBeNull();
  });

  test("refuses requests from other sites", async () => {
    const { config, rotate, store } = await setup(true);
    expect((await rotate(true, { "sec-fetch-site": "same-site" })).status).toBe(403);
    expect((await rotate(true, { origin: "https://other.thatscrazy.dev", host: "polis.test" })).status).toBe(403);
    expect(store.getPolisConfig(config.id)).not.toBeNull();
  });

  test("refuses profiles without a password", async () => {
    const { rotate } = await setup(false);
    expect((await rotate(true)).status).toBe(403);
  });
});
