import { describe, expect, test } from "bun:test";

import {
  profileCreateClientKey,
  profileCreateRetryAfterSeconds,
  recordProfileCreated,
} from "@/lib/polis-profile-create-limit";

const HOUR_MS = 60 * 60 * 1000;
const PER_CLIENT_LIMIT = 5;
const SERVER_LIMIT = 60;

describe("profile creation limit", () => {
  test("uses the address the proxy appended, not one the caller sent", () => {
    const request = new Request("https://polis.example/api/config", {
      headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9" },
    });
    expect(profileCreateClientKey(request)).toBe("203.0.113.9");
  });

  test("blocks a client after five new profiles in an hour and frees it after the hour", () => {
    const start = 10 * HOUR_MS;
    for (let i = 0; i < PER_CLIENT_LIMIT; i += 1) {
      expect(profileCreateRetryAfterSeconds("client-a", start)).toBeNull();
      recordProfileCreated("client-a", start);
    }
    expect(profileCreateRetryAfterSeconds("client-a", start)).toBe(HOUR_MS / 1000);
    expect(profileCreateRetryAfterSeconds("client-b", start)).toBeNull();
    expect(profileCreateRetryAfterSeconds("client-a", start + HOUR_MS)).toBeNull();
  });

  test("caps creation across the whole server even when every caller looks new", () => {
    const start = 100 * HOUR_MS;
    for (let i = 0; i < SERVER_LIMIT; i += 1) recordProfileCreated(`spoofed-${i}`, start);
    expect(profileCreateRetryAfterSeconds("brand-new", start)).not.toBeNull();
    expect(profileCreateRetryAfterSeconds("brand-new", start + HOUR_MS)).toBeNull();
  });
});
