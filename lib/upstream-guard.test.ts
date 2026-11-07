import { describe, expect, test } from "bun:test";

import {
  redactUpstreamSecrets,
  UpstreamGuard,
  type UpstreamCallScope,
  type UpstreamProviderPolicy,
} from "@/lib/upstream-guard";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

function clockedGuard(options: {
  start?: number;
  policy?: Partial<UpstreamProviderPolicy>;
  maxWaitMs?: number;
  sharePercent?: number;
}) {
  const clock = { now: options.start ?? Date.UTC(2026, 10, 7, 12) };
  const policy: UpstreamProviderPolicy = {
    windows: [{ limit: 100, windowMs: SECOND_MS }],
    maxConcurrent: 10,
    defaultCooldownMs: MINUTE_MS,
    dailyLimit: () => null,
    ...options.policy,
  };
  const guard = new UpstreamGuard({
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
      await Promise.resolve();
    },
    maxWaitMs: options.maxWaitMs ?? 2 * SECOND_MS,
    policies: { tmdb: policy, mdblist: policy },
    sharePercent: () => options.sharePercent ?? 20,
  });
  return { guard, clock };
}

const scope: UpstreamCallScope = { provider: "tmdb", credentialFingerprint: "key-a" };

function ok(headers: Record<string, string> = {}, status = 200) {
  return async () => new Response("{}", { status, headers });
}

async function call(guard: UpstreamGuard, s: UpstreamCallScope, response = ok()) {
  const result = await guard.request(s, response, async (r) => r.status);
  return result.ok ? result.value : result.reason;
}

describe("global provider limits", () => {
  test("waits for the next window slot within the bounded wait", async () => {
    const { guard, clock } = clockedGuard({ policy: { windows: [{ limit: 2, windowMs: SECOND_MS }] } });
    const start = clock.now;
    expect(await call(guard, scope)).toBe(200);
    expect(await call(guard, scope)).toBe(200);
    expect(await call(guard, scope)).toBe(200);
    expect(clock.now - start).toBe(SECOND_MS);
  });

  test("gives up when the window is full past the wait limit", async () => {
    const { guard } = clockedGuard({
      policy: { windows: [{ limit: 1, windowMs: MINUTE_MS }] },
      maxWaitMs: 2 * SECOND_MS,
    });
    expect(await call(guard, scope)).toBe(200);
    expect(await call(guard, scope)).toBe("busy");
  });

  test("caps concurrent requests", async () => {
    const { guard } = clockedGuard({ policy: { maxConcurrent: 1 }, maxWaitMs: 100 });
    let finish: (r: Response) => void = () => {};
    const first = guard.request(
      scope,
      () => new Promise<Response>((resolve) => (finish = resolve)),
      async (r) => r.status,
    );
    expect(await call(guard, scope)).toBe("busy");
    finish(new Response("{}"));
    expect(await first).toEqual({ ok: true, value: 200 });
    expect(await call(guard, scope)).toBe(200);
  });
});

describe("per key cooldowns and quota", () => {
  test("honors Retry-After on 429 for that key only", async () => {
    const { guard, clock } = clockedGuard({});
    expect(await call(guard, scope, ok({ "retry-after": "30" }, 429))).toBe(429);
    expect(await call(guard, scope)).toBe("cooldown");
    expect(await call(guard, { ...scope, credentialFingerprint: "key-b" })).toBe(200);
    clock.now += 31 * SECOND_MS;
    expect(await call(guard, scope)).toBe(200);
  });

  test("pauses MDBList until the next UTC midnight without headers", async () => {
    const { guard, clock } = clockedGuard({
      start: Date.UTC(2026, 10, 7, 22),
      policy: { defaultCooldownMs: "next_utc_midnight" },
    });
    const mdb: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "mdb-a" };
    expect(await call(guard, mdb, ok({}, 429))).toBe(429);
    clock.now = Date.UTC(2026, 10, 7, 23, 59);
    expect(await call(guard, mdb)).toBe("cooldown");
    clock.now = Date.UTC(2026, 10, 8, 0, 0, 1);
    expect(await call(guard, mdb)).toBe(200);
  });

  test("uses x-ratelimit-reset when there is no Retry-After", async () => {
    const { guard, clock } = clockedGuard({});
    const resetAt = Math.floor(clock.now / SECOND_MS) + 120;
    await call(guard, scope, ok({ "x-ratelimit-reset": String(resetAt) }, 429));
    clock.now += 119 * SECOND_MS;
    expect(await call(guard, scope)).toBe("cooldown");
    clock.now += 2 * SECOND_MS;
    expect(await call(guard, scope)).toBe(200);
  });

  test("skips background calls when headers report a low quota", async () => {
    const { guard } = clockedGuard({});
    await call(guard, scope, ok({ "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "10" }));
    expect(await call(guard, { ...scope, background: true })).toBe("quota_low");
    expect(await call(guard, { ...scope, background: false })).toBe(200);
  });

  test("skips background calls near the known daily limit", async () => {
    const { guard } = clockedGuard({ policy: { dailyLimit: () => 20 } });
    const mdb: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "mdb-b", background: true };
    for (let i = 0; i < 19; i += 1) expect(await call(guard, mdb)).toBe(200);
    expect(await call(guard, mdb)).toBe("quota_low");
    expect(await call(guard, { ...mdb, background: false })).toBe(200);
  });

  test("pauses a key for 15 minutes after an auth failure unless opted out", async () => {
    const { guard, clock } = clockedGuard({});
    await call(guard, scope, ok({}, 401));
    expect(await call(guard, scope)).toBe("cooldown");
    clock.now += 15 * MINUTE_MS + 1;
    expect(await call(guard, scope)).toBe(200);

    const tokenScope = { ...scope, credentialFingerprint: "key-t", authFailureCooldown: false };
    await call(guard, tokenScope, ok({}, 401));
    expect(await call(guard, tokenScope)).toBe(200);
  });
});

describe("per profile share of the server key", () => {
  test("caps each profile at its share and resets daily", async () => {
    const { guard, clock } = clockedGuard({ policy: { dailyLimit: () => 10 }, sharePercent: 20 });
    const server: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "server", serverKeyProfile: "p1" };
    expect(await call(guard, server)).toBe(200);
    expect(await call(guard, server)).toBe(200);
    expect(await call(guard, server)).toBe("profile_budget");
    expect(await call(guard, { ...server, serverKeyProfile: "p2" })).toBe(200);
    expect(await call(guard, { ...server, serverKeyProfile: null })).toBe(200);
    clock.now += 24 * 60 * MINUTE_MS;
    expect(await call(guard, server)).toBe(200);
  });

  test("does not cap providers without a daily limit", async () => {
    const { guard } = clockedGuard({ sharePercent: 1 });
    const server: UpstreamCallScope = { ...scope, serverKeyProfile: "p1" };
    for (let i = 0; i < 5; i += 1) expect(await call(guard, server)).toBe(200);
  });
});

test("redacts api keys and bearer tokens", () => {
  expect(
    redactUpstreamSecrets("GET https://x.test/a?apikey=abc123&i=tt1 Authorization: Bearer tok.en"),
  ).toBe("GET https://x.test/a?apikey=REDACTED&i=tt1 Authorization: Bearer REDACTED");
  expect(redactUpstreamSecrets("https://x.test/?i=1&api_key=k")).toBe("https://x.test/?i=1&api_key=REDACTED");
});
