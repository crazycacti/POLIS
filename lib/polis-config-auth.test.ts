import { describe, expect, it } from "bun:test";

import { validateNewPasswordPair } from "@/lib/polis-config-auth-constants";
import {
  createConfigureSessionToken,
  parseConfigureSessionCookie,
  verifyConfigureSessionToken,
} from "@/lib/polis-config-auth";

describe("polis-config-auth", () => {
  it("validates matching password pair", () => {
    const result = validateNewPasswordPair("longenough", "longenough");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.password).toBe("longenough");
    }
  });

  it("rejects short password", () => {
    const result = validateNewPasswordPair("short", "short");
    expect(result.ok).toBe(false);
  });

  it("creates and verifies session token", () => {
    const token = createConfigureSessionToken("abc123XYZ-_", "scrypt:a:b");
    expect(verifyConfigureSessionToken(token, "abc123XYZ-_", "scrypt:a:b")).toBe(true);
    expect(verifyConfigureSessionToken(token, "otherid123456", "scrypt:a:b")).toBe(false);
  });

  it("rejects a session made before the password was set or changed", () => {
    const beforePassword = createConfigureSessionToken("abc123XYZ-_", null);
    expect(verifyConfigureSessionToken(beforePassword, "abc123XYZ-_", null)).toBe(true);
    expect(verifyConfigureSessionToken(beforePassword, "abc123XYZ-_", "scrypt:a:b")).toBe(false);
    const oldPassword = createConfigureSessionToken("abc123XYZ-_", "scrypt:a:b");
    expect(verifyConfigureSessionToken(oldPassword, "abc123XYZ-_", "scrypt:c:d")).toBe(false);
  });

  it("treats a malformed session cookie as no session", () => {
    expect(parseConfigureSessionCookie("polis_configure_session=%E0")).toBeNull();
  });

  it("reads a well-formed session cookie", () => {
    const token = createConfigureSessionToken("abc123XYZ-_", null);
    const parsed = parseConfigureSessionCookie(
      `other=1; polis_configure_session=${encodeURIComponent(token)}`,
    );
    expect(parsed).toEqual({ configId: "abc123XYZ-_", token });
  });
});
