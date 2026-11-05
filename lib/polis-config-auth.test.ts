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
    const token = createConfigureSessionToken("abc123XYZ-_");
    expect(verifyConfigureSessionToken(token, "abc123XYZ-_")).toBe(true);
    expect(verifyConfigureSessionToken(token, "otherid123456")).toBe(false);
  });

  it("treats a malformed session cookie as no session", () => {
    expect(parseConfigureSessionCookie("polis_configure_session=%E0")).toBeNull();
  });

  it("reads a well-formed session cookie", () => {
    const token = createConfigureSessionToken("abc123XYZ-_");
    const parsed = parseConfigureSessionCookie(
      `other=1; polis_configure_session=${encodeURIComponent(token)}`,
    );
    expect(parsed).toEqual({ configId: "abc123XYZ-_", token });
  });
});
