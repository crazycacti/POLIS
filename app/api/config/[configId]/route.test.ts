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

async function setup() {
  const { getPolisDb } = await import("@/lib/db");
  // Refuse to write test rows into a database other than the temporary one from test/preload.ts.
  expect(getPolisDb().filename.startsWith(tmpdir())).toBe(true);
  const store = await import("@/lib/polis-config-store");
  const auth = await import("@/lib/polis-config-auth");
  const { parsePosterOverlayQuery } = await import("@/lib/poster-query");
  const { GET } = await import("@/app/api/config/[configId]/route");
  const config = store.createPolisConfig({
    overlay: parsePosterOverlayQuery(new URLSearchParams()),
    passwordHash: await auth.hashConfigPassword("correct horse battery"),
  });
  const get = (cookie?: string) =>
    GET(new Request(`http://polis.test/api/config/${config.id}`, { headers: cookie ? { cookie } : {} }), {
      params: Promise.resolve({ configId: config.id }),
    });
  const sessionCookie = auth.configureSessionCookieHeader(auth.createConfigureSessionToken(config.id, store.getConfigPasswordHash(config.id))).split(";")[0];
  return { config, get, sessionCookie, auth, store };
}

describe("GET /api/config/[configId]", () => {
  test("keeps a password profile's settings from callers without its session", async () => {
    const { get } = await setup();
    const response = await get();
    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.catalogs).toBeUndefined();
    expect(body.posterQuery).toBeUndefined();
  });

  test("returns the settings with the profile's session", async () => {
    const { get, sessionCookie, config } = await setup();
    const response = await get(sessionCookie);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { configId?: string }).configId).toBe(config.id);
  });

  test("does not accept another profile's session", async () => {
    const { get, auth } = await setup();
    const other = await setup();
    const foreign = auth.configureSessionCookieHeader(auth.createConfigureSessionToken(other.config.id, other.store.getConfigPasswordHash(other.config.id))).split(";")[0];
    expect((await get(foreign)).status).toBe(401);
  });

  test("ends older sessions when the password changes", async () => {
    const { config, get, sessionCookie, store } = await setup();
    expect((await get(sessionCookie)).status).toBe(200);
    await store.setPolisConfigPassword(config.id, "a different passphrase");
    expect((await get(sessionCookie)).status).toBe(401);
  });
});
