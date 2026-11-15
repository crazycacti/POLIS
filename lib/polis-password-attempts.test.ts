import { describe, expect, test } from "bun:test";

import {
  clearPasswordFailures,
  passwordAttemptRetryAfterSeconds,
  recordPasswordFailure,
} from "@/lib/polis-password-attempts";

const WINDOW_MS = 15 * 60 * 1000;

describe("password attempt limiter", () => {
  test("locks a client after repeated failures and unlocks when the window ends", () => {
    const id = "limiter-test-config";
    const start = 1_000_000;
    for (let i = 0; i < 9; i += 1) recordPasswordFailure(id, "203.0.113.1", start);
    expect(passwordAttemptRetryAfterSeconds(id, "203.0.113.1", start)).toBeNull();
    recordPasswordFailure(id, "203.0.113.1", start);
    expect(passwordAttemptRetryAfterSeconds(id, "203.0.113.1", start)).toBe(900);
    expect(passwordAttemptRetryAfterSeconds(id, "203.0.113.1", start + WINDOW_MS)).toBeNull();
  });

  test("a stranger's wrong guesses do not lock the owner out on another connection", () => {
    const id = "limiter-owner-config";
    const start = 2_000_000;
    for (let i = 0; i < 10; i += 1) recordPasswordFailure(id, "198.51.100.7", start);
    expect(passwordAttemptRetryAfterSeconds(id, "198.51.100.7", start)).not.toBeNull();
    expect(passwordAttemptRetryAfterSeconds(id, "203.0.113.20", start)).toBeNull();
  });

  test("guesses spread across many addresses still hit the profile ceiling", () => {
    const id = "limiter-spread-config";
    const start = 3_000_000;
    for (let i = 0; i < 100; i += 1) recordPasswordFailure(id, `198.51.100.${i}`, start);
    expect(passwordAttemptRetryAfterSeconds(id, "203.0.113.99", start)).not.toBeNull();
  });

  test("a successful unlock clears that client's failures", () => {
    const id = "limiter-clear-config";
    for (let i = 0; i < 10; i += 1) recordPasswordFailure(id, "203.0.113.5");
    clearPasswordFailures(id, "203.0.113.5");
    expect(passwordAttemptRetryAfterSeconds(id, "203.0.113.5")).toBeNull();
  });
});

describe("checkConfigPassword ordering", () => {
  test("counts an attempt before verification finishes", async () => {
    const { checkConfigPassword } = await import("@/lib/polis-config-api-auth");
    const id = "limiter-parallel-config";
    const results = await Promise.all(
      Array.from({ length: 25 }, () => checkConfigPassword(id, "wrong-password", "203.0.113.50")),
    );
    expect(results.filter((r) => !r.ok && r.status === 401).length).toBe(10);
    expect(results.filter((r) => !r.ok && r.status === 429).length).toBe(15);
  });
});
