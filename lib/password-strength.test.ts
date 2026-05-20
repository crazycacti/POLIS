import { describe, expect, it } from "bun:test";

import { measurePasswordStrength } from "@/lib/password-strength";

describe("measurePasswordStrength", () => {
  it("scores short passwords as too short", () => {
    expect(measurePasswordStrength("abc").score).toBe(0);
  });

  it("scores mixed passwords higher", () => {
    const weak = measurePasswordStrength("password1");
    const strong = measurePasswordStrength("Password1!extra");
    expect(strong.score).toBeGreaterThan(weak.score);
  });
});
