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
  expect(getPolisDb().filename.startsWith(tmpdir())).toBe(true);
  const store = await import("@/lib/polis-config-store");
  const auth = await import("@/lib/polis-config-auth");
  const { parsePosterOverlayQuery } = await import("@/lib/poster-query");
  const { POST } = await import("@/app/api/config/route");
  const config = store.createPolisConfig({
    overlay: parsePosterOverlayQuery(new URLSearchParams()),
    catalogs: [],
    label: "Original",
    passwordHash: await auth.hashConfigPassword("correct horse battery"),
  });
  const cookie = auth
    .configureSessionCookieHeader(auth.createConfigureSessionToken(config.id, store.getConfigPasswordHash(config.id)))
    .split(";")[0];
  const save = (body: unknown, headers: Record<string, string>) =>
    POST(
      new Request("http://polis.test/api/config", {
        method: "POST",
        headers: { cookie, "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );
  return { config, save, store };
}

describe("POST /api/config", () => {
  test("saves a profile from the configure page", async () => {
    const { config, save, store } = await setup();
    const response = await save({ configId: config.id, label: "Renamed" }, { "sec-fetch-site": "same-origin" });
    expect(response.status).toBe(200);
    expect(store.getPolisConfig(config.id)?.label).toBe("Renamed");
  });

  test("refuses a save sent from another site with the owner's session", async () => {
    const { config, save, store } = await setup();
    const response = await save(
      { configId: config.id, label: "Hijacked" },
      { "sec-fetch-site": "same-site", origin: "https://other.polis.test" },
    );
    expect(response.status).toBe(403);
    expect(store.getPolisConfig(config.id)?.label).toBe("Original");
  });

  test("refuses an already encrypted key value from the client", async () => {
    const { config, save } = await setup();
    const response = await save(
      { configId: config.id, integrator: { mdblistApiKey: "enc:v1:copied-from-another-row" } },
      { "sec-fetch-site": "same-origin" },
    );
    expect(response.status).toBe(400);
  });

  test("refuses an unlock sent from another site", async () => {
    const { config } = await setup();
    const { POST: unlock } = await import("@/app/api/config/[configId]/unlock/route");
    const response = await unlock(
      new Request(`http://polis.test/api/config/${config.id}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
        body: JSON.stringify({ password: "wrong password guess" }),
      }),
      { params: Promise.resolve({ configId: config.id }) },
    );
    expect(response.status).toBe(403);
  });
});
