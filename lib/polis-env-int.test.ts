import { afterEach, describe, expect, it } from "bun:test";

import { polisEnvPositiveInt } from "@/lib/polis-env-int";

const NAME = "POLIS_TEST_POSITIVE_INT";

afterEach(() => {
  delete process.env[NAME];
});

describe("polisEnvPositiveInt", () => {
  it("ignores a fraction below one instead of reading it as zero", () => {
    process.env[NAME] = "0.5";
    expect(polisEnvPositiveInt(NAME)).toBeNull();
  });

  it("rounds a fraction down to a whole number", () => {
    process.env[NAME] = "3.9";
    expect(polisEnvPositiveInt(NAME)).toBe(3);
  });
});
