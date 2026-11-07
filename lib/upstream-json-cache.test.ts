import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { writePolisDiskJson } from "@/lib/polis-disk-cache";
import { UpstreamGuard } from "@/lib/upstream-guard";
import { cachedUpstreamJson } from "@/lib/upstream-json-cache";
import { runAsBackgroundUpstreamWork } from "@/lib/upstream-priority";

const HOUR_MS = 60 * 60 * 1000;
let root = "";
const savedEnv = { ...process.env };

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "polis-upstream-"));
  process.env.POLIS_CACHE_DIR = root;
  delete process.env.POLIS_CACHE_DISABLE;
});

afterEach(async () => {
  await settleWrites();
  process.env = { ...savedEnv };
  await rm(root, { recursive: true, force: true });
});

type Scripted = Response | Error | (() => Promise<Response>);

function harness(script: Scripted[]) {
  let calls = 0;
  const guard = new UpstreamGuard();
  const lookup = (key = "k1") =>
    cachedUpstreamJson<{ n: number }>({
      provider: "fanart",
      cacheKey: key,
      ttlMs: HOUR_MS,
      negativeTtlMs: HOUR_MS,
      label: `test ${key}`,
      credentialFingerprint: "fp",
      guard,
      request: async () => {
        const next = script[Math.min(calls, script.length - 1)]!;
        calls += 1;
        if (next instanceof Error) throw next;
        if (typeof next === "function") return next();
        return next.clone();
      },
      parse: (payload) => {
        const n = (payload as { n?: unknown } | null)?.n;
        return typeof n === "number" ? { n } : null;
      },
    });
  return { lookup, guard, calls: () => calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

async function seed(key: string, envelope: unknown) {
  await writePolisDiskJson("api/fanart", "g", key, envelope);
}

async function settleWrites() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("cachedUpstreamJson", () => {
  test("fetches, stores and then serves the fresh copy", async () => {
    const h = harness([json({ n: 1 })]);
    expect(await h.lookup()).toEqual({ value: { n: 1 }, outcome: "fetched", storedAt: expect.any(Number) });
    await settleWrites();
    expect(await h.lookup()).toEqual({ value: { n: 1 }, outcome: "fresh", storedAt: expect.any(Number) });
    expect(h.calls()).toBe(1);
  });

  test("refreshes an expired copy", async () => {
    await seed("k1", { at: Date.now() - 2 * HOUR_MS, value: { n: 1 } });
    const h = harness([json({ n: 2 })]);
    expect(await h.lookup()).toEqual({ value: { n: 2 }, outcome: "fetched", storedAt: expect.any(Number) });
  });

  test("serves the stale copy on 5xx, network errors and invalid payloads", async () => {
    await seed("k1", { at: Date.now() - 2 * HOUR_MS, value: { n: 1 } });
    const h = harness([json({}, 503), new Error("connect failed https://x.test/?api_key=secret"), json({ bad: true })]);
    expect(await h.lookup()).toEqual({ value: { n: 1 }, outcome: "stale" });
    expect(await h.lookup()).toEqual({ value: { n: 1 }, outcome: "stale" });
    expect(await h.lookup()).toEqual({ value: { n: 1 }, outcome: "stale" });
    expect(h.calls()).toBe(3);
  });

  test("reports unavailable when nothing is cached and the call fails", async () => {
    const h = harness([json({}, 500)]);
    expect(await h.lookup()).toEqual({ value: null, outcome: "unavailable" });
  });

  test("hands the network error back when nothing is cached", async () => {
    const failure = new Error("connect failed");
    const h = harness([failure]);
    expect(await h.lookup()).toEqual({ value: null, outcome: "unavailable", error: failure });
  });

  test("stores a negative marker on 404 and skips calls until it expires", async () => {
    const h = harness([json({}, 404)]);
    expect(await h.lookup()).toEqual({ value: null, outcome: "missing" });
    await settleWrites();
    expect(await h.lookup()).toEqual({ value: null, outcome: "missing" });
    expect(h.calls()).toBe(1);
  });

  test("a 429 serves stale and stops further calls for that key", async () => {
    await seed("k1", { at: Date.now() - 2 * HOUR_MS, value: { n: 1 } });
    await seed("k2", { at: Date.now() - 2 * HOUR_MS, value: { n: 2 } });
    const h = harness([json({}, 429, { "retry-after": "600" })]);
    expect(await h.lookup("k1")).toEqual({ value: { n: 1 }, outcome: "stale" });
    expect(await h.lookup("k2")).toEqual({ value: { n: 2 }, outcome: "stale" });
    expect(await h.lookup("k3")).toEqual({ value: null, outcome: "unavailable" });
    expect(h.calls()).toBe(1);
  });

  test("shares one request between concurrent callers", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = harness([
      async () => {
        await gate;
        return json({ n: 5 });
      },
    ]);
    const all = Promise.all([h.lookup(), h.lookup(), h.lookup()]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const results = await all;
    expect(results.map((r) => r.value?.n)).toEqual([5, 5, 5]);
    expect(h.calls()).toBe(1);
  });

  test("background refreshes skip a key that is low on quota", async () => {
    await seed("k1", { at: Date.now() - 2 * HOUR_MS, value: { n: 1 } });
    const h = harness([json({ n: 2 }, 200, { "x-ratelimit-limit": "100", "x-ratelimit-remaining": "1" })]);
    expect((await h.lookup("other")).outcome).toBe("fetched");
    expect(await runAsBackgroundUpstreamWork(() => h.lookup("k1"))).toEqual({
      value: { n: 1 },
      outcome: "stale",
    });
    expect(h.calls()).toBe(1);
    expect((await h.lookup("k1")).outcome).toBe("fetched");
  });
});

describe("cachedUpstreamJson flights", () => {
  test("a caller over its profile share does not block a caller with its own key", async () => {
    process.env.POLIS_MDBLIST_DAILY_LIMIT = "100";
    let calls = 0;
    const guard = new UpstreamGuard({ sharePercent: () => 1 });
    const lookup = (cacheKey: string, fingerprint: string, serverKeyProfile: string | null) =>
      cachedUpstreamJson<{ n: number }>({
        provider: "mdblist",
        cacheKey,
        ttlMs: HOUR_MS,
        negativeTtlMs: HOUR_MS,
        label: "flight test",
        credentialFingerprint: fingerprint,
        serverKeyProfile,
        guard,
        request: async () => {
          calls += 1;
          return json({ n: calls });
        },
        parse: (payload) => payload as { n: number },
      });
    expect((await lookup("warmup", "server", "p1")).outcome).toBe("fetched");
    const [blocked, own] = await Promise.all([
      lookup("shared", "server", "p1"),
      lookup("shared", "own", null),
    ]);
    expect(blocked).toEqual({ value: null, outcome: "unavailable" });
    expect(own).toEqual({ value: { n: 2 }, outcome: "fetched", storedAt: expect.any(Number) });
  });
});
