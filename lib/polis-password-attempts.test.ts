import { describe, expect, test } from "bun:test";

import {
  clearPasswordFailures,
  passwordAttemptRetryAfterSeconds,
  recordPasswordFailure,
} from "@/lib/polis-password-attempts";

describe("password attempt limiter", () => {
  test("locks after repeated failures and unlocks when the window ends", () => {
    const id = "limiter-test-config";
    const start = 1_000_000;
    for (let i = 0; i < 9; i += 1) recordPasswordFailure(id, start);
    expect(passwordAttemptRetryAfterSeconds(id, start)).toBeNull();
    recordPasswordFailure(id, start);
    expect(passwordAttemptRetryAfterSeconds(id, start)).toBe(900);
    expect(passwordAttemptRetryAfterSeconds(id, start + 15 * 60 * 1000)).toBeNull();
  });

  test("a success clears the count", () => {
    const id = "limiter-clear-config";
    for (let i = 0; i < 10; i += 1) recordPasswordFailure(id);
    clearPasswordFailures(id);
    expect(passwordAttemptRetryAfterSeconds(id)).toBeNull();
  });
});

describe("checkConfigPassword ordering", () => {
  test("counts an attempt before verification finishes", async () => {
    const { checkConfigPassword } = await import("@/lib/polis-config-api-auth");
    const id = "limiter-parallel-config";
    const results = await Promise.all(
      Array.from({ length: 25 }, () => checkConfigPassword(id, "wrong-password")),
    );
    expect(results.filter((r) => !r.ok && r.status === 401).length).toBe(10);
    expect(results.filter((r) => !r.ok && r.status === 429).length).toBe(15);
  });
});
