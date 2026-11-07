import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let dir = "";
let dbFile = "";

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "polis-config-get-"));
  dbFile = path.join(dir, "test.sqlite");
  process.env.POLIS_DB_PATH = dbFile;
  process.env.POLIS_SESSION_SECRET = "test-session-secret-0123456789abcdef";
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function setup() {
  const { getPolisDb } = await import("@/lib/db");
  // Refuse to write test rows into a database other than the temporary one.
  expect(getPolisDb().filename).toBe(dbFile);
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
  const sessionCookie = auth.configureSessionCookieHeader(auth.createConfigureSessionToken(config.id)).split(";")[0];
  return { config, get, sessionCookie, auth };
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
    const foreign = auth.configureSessionCookieHeader(auth.createConfigureSessionToken(other.config.id)).split(";")[0];
    expect((await get(foreign)).status).toBe(401);
  });
});
