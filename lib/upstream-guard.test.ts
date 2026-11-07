import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  redactUpstreamSecrets,
  UPSTREAM_PROVIDER_POLICIES,
  UpstreamGuard,
  type UpstreamCallScope,
  type UpstreamProviderPolicy,
} from "@/lib/upstream-guard";
import { guardStateStore } from "@/lib/upstream-guard-store";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

function clockedGuard(options: {
  start?: number;
  policy?: Partial<UpstreamProviderPolicy>;
  mdblistPolicy?: Partial<UpstreamProviderPolicy>;
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
    policies: { tmdb: policy, mdblist: { ...UPSTREAM_PROVIDER_POLICIES.mdblist, ...options.mdblistPolicy } },
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

describe("mdblist burst window", () => {
  test("stops at 1,000 reads in five minutes and resumes after the window", async () => {
    const { guard, clock } = clockedGuard({ mdblistPolicy: { dailyLimit: () => null } });
    const mdblist: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "key-m" };
    for (let i = 0; i < 1000; i++) {
      expect(await call(guard, mdblist)).toBe(200);
      clock.now += 200;
    }
    expect(await call(guard, mdblist)).toBe("busy");
    clock.now += 5 * MINUTE_MS;
    expect(await call(guard, mdblist)).toBe(200);
  });
});

describe("per key cooldowns and quota", () => {
  test("honors Retry-After on 429 for that key only", async () => {
    const { guard, clock } = clockedGuard({});
    expect(await call(guard, scope, ok({ "retry-after": "30" }, 429))).toBe(429);
    expect(await call(guard, scope)).toBe("rate_limited");
    expect(await call(guard, { ...scope, credentialFingerprint: "key-b" })).toBe(200);
    clock.now += 31 * SECOND_MS;
    expect(await call(guard, scope)).toBe(200);
  });

  test("pauses MDBList briefly for a 429 without quota details", async () => {
    const { guard, clock } = clockedGuard({});
    const mdb: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "mdb-short" };
    expect(await call(guard, mdb, ok({}, 429))).toBe(429);
    expect(await call(guard, mdb)).toBe("rate_limited");
    clock.now += MINUTE_MS + 1;
    expect(await call(guard, mdb)).toBe(200);
  });

  test("pauses MDBList until the next UTC midnight when the daily limit is used up", async () => {
    const { guard, clock } = clockedGuard({ start: Date.UTC(2026, 10, 7, 22) });
    const byBody: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "mdb-body" };
    const byHeader: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "mdb-header" };
    const dailyBody = async () => Response.json({ error: "Daily API limit exceeded!" }, { status: 429 });
    expect(await call(guard, byBody, dailyBody)).toBe(429);
    expect(await call(guard, byHeader, ok({ "x-ratelimit-remaining": "0" }, 429))).toBe(429);
    clock.now = Date.UTC(2026, 10, 7, 23, 59);
    expect(await call(guard, byBody)).toBe("rate_limited");
    expect(await call(guard, byHeader)).toBe("rate_limited");
    clock.now = Date.UTC(2026, 10, 8, 0, 0, 1);
    expect(await call(guard, byBody)).toBe(200);
    expect(await call(guard, byHeader)).toBe(200);
  });

  test.each([
    ["seconds from now", (_now: number) => "120"],
    ["epoch seconds", (now: number) => String(Math.floor(now / SECOND_MS) + 120)],
    ["epoch milliseconds", (now: number) => String(now + 120 * SECOND_MS)],
  ])("reads x-ratelimit-reset as %s", async (_label, reset) => {
    const { guard, clock } = clockedGuard({});
    await call(guard, scope, ok({ "x-ratelimit-reset": reset(clock.now) }, 429));
    clock.now += 119 * SECOND_MS;
    expect(await call(guard, scope)).toBe("rate_limited");
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
    const { guard } = clockedGuard({ mdblistPolicy: { dailyLimit: () => 20 } });
    const mdb: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "mdb-b", background: true };
    for (let i = 0; i < 19; i += 1) expect(await call(guard, mdb)).toBe(200);
    expect(await call(guard, mdb)).toBe("quota_low");
    expect(await call(guard, { ...mdb, background: false })).toBe(200);
  });

  test("pauses a key for 15 minutes after an auth failure unless opted out", async () => {
    const { guard, clock } = clockedGuard({});
    await call(guard, scope, ok({}, 401));
    expect(await call(guard, scope)).toBe("auth_rejected");
    clock.now += 15 * MINUTE_MS + 1;
    expect(await call(guard, scope)).toBe(200);

    const tokenScope = { ...scope, credentialFingerprint: "key-t", authFailureCooldown: false };
    await call(guard, tokenScope, ok({}, 401));
    expect(await call(guard, tokenScope)).toBe(200);
  });
});

describe("per profile share of the server key", () => {
  test("caps each profile at its share and resets daily", async () => {
    const { guard, clock } = clockedGuard({ mdblistPolicy: { dailyLimit: () => 10 }, sharePercent: 20 });
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

describe("usage across restarts", () => {
  const server: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "server", serverKeyProfile: "p1" };

  function restarted(snapshot: unknown, start: number) {
    const { guard, clock } = clockedGuard({ start, mdblistPolicy: { dailyLimit: () => 10 }, sharePercent: 20 });
    guard.restore(JSON.parse(JSON.stringify(snapshot)));
    return { guard, clock };
  }

  test("keeps a profile's used share after a restart the same day", async () => {
    const before = clockedGuard({ mdblistPolicy: { dailyLimit: () => 10 }, sharePercent: 20 });
    expect(await call(before.guard, server)).toBe(200);
    expect(await call(before.guard, server)).toBe(200);
    const after = restarted(before.guard.snapshot(), before.clock.now + MINUTE_MS);
    expect(await call(after.guard, server)).toBe("profile_budget");
  });

  test("starts fresh when the saved usage is from an earlier day", async () => {
    const before = clockedGuard({ mdblistPolicy: { dailyLimit: () => 10 }, sharePercent: 20 });
    await call(before.guard, server);
    await call(before.guard, server);
    const after = restarted(before.guard.snapshot(), before.clock.now + 24 * 60 * MINUTE_MS);
    expect(await call(after.guard, server)).toBe(200);
  });

  test("keeps a running rate limit pause", async () => {
    const before = clockedGuard({});
    const mdblist: UpstreamCallScope = { provider: "mdblist", credentialFingerprint: "key-r" };
    await call(before.guard, mdblist, ok({ "retry-after": "600" }, 429));
    const after = restarted(before.guard.snapshot(), before.clock.now + MINUTE_MS);
    expect(await call(after.guard, mdblist)).toBe("rate_limited");
  });

  test("ignores malformed saved state", async () => {
    const { guard } = restarted({ keys: [{ id: 5 }, null, { id: "x", used: -1 }], profiles: "nope" }, Date.UTC(2026, 10, 7, 12));
    expect(await call(guard, server)).toBe(200);
  });

  test("saves through the file store and loads it back", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "polis-guard-"));
    const file = path.join(dir, "upstream-guard.json");
    try {
      const before = clockedGuard({ mdblistPolicy: { dailyLimit: () => 10 }, sharePercent: 20 });
      await call(before.guard, server);
      await call(before.guard, server);
      await writeFile(file, JSON.stringify(before.guard.snapshot()));
      const loaded = guardStateStore(() => null, file).load();
      const after = restarted(loaded, before.clock.now);
      expect(await call(after.guard, server)).toBe("profile_budget");
      expect(guardStateStore(() => null, path.join(dir, "missing.json")).load()).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test("redacts api keys and bearer tokens", () => {
  expect(
    redactUpstreamSecrets("GET https://x.test/a?apikey=abc123&i=tt1 Authorization: Bearer tok.en"),
  ).toBe("GET https://x.test/a?apikey=REDACTED&i=tt1 Authorization: Bearer REDACTED");
  expect(redactUpstreamSecrets("https://x.test/?i=1&api_key=k")).toBe("https://x.test/?i=1&api_key=REDACTED");
});
