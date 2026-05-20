import { describe, expect, test } from "bun:test";

import { formatTvdbCredentials, parseTvdbCredentials } from "@/lib/tvdb-credentials";

describe("parseTvdbCredentials", () => {
  test("parses api key only", () => {
    expect(parseTvdbCredentials("abcd1234567890")).toEqual({
      apiKey: "abcd1234567890",
    });
  });

  test("parses key|pin", () => {
    expect(parseTvdbCredentials("abcd1234567890|1234")).toEqual({
      apiKey: "abcd1234567890",
      pin: "1234",
    });
  });

  test("rejects short values", () => {
    expect(parseTvdbCredentials("short")).toBeNull();
  });
});

describe("formatTvdbCredentials", () => {
  test("includes pin when set", () => {
    expect(
      formatTvdbCredentials({ apiKey: "abcd1234567890", pin: "9999" }),
    ).toBe("abcd1234567890|9999");
  });
});
